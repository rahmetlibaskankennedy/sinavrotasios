package com.sinavrotasi.mebgys;

import android.app.Activity;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Play Billing Library v8 üzerinden tek seferlik ("Tüketici") ürün satın
 * alma akışını www/ tarafına açan Capacitor plugin'i.
 *
 * Akış: purchase(productId) -> Google'ın ödeme ekranı -> onPurchasesUpdated
 * -> www tarafına { productId, purchaseToken } döner -> www bunu
 * verify-play-purchase Edge Function'a gönderip sunucu tarafında doğrulatır.
 *
 * ÖNEMLİ: Bu plugin is_premium'u HİÇBİR ŞEKİLDE doğrudan set etmez —
 * yalnızca Google'dan gelen ham satın alma bilgisini JS tarafına iletir.
 * Gerçek yetkilendirme sunucuda (apply_verified_purchase RPC) yapılır.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

  private BillingClient billingClient;

  @Override
  public void load() {
    Activity activity = getActivity();
    billingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build();
  }

  private void ensureConnected(Runnable onReady, PluginCall failCall) {
    if (billingClient.isReady()) {
      onReady.run();
      return;
    }
    billingClient.startConnection(new BillingClientStateListener() {
      @Override
      public void onBillingSetupFinished(BillingResult billingResult) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
          onReady.run();
        } else if (failCall != null) {
          failCall.reject("Play Billing bağlantısı kurulamadı: " + billingResult.getDebugMessage());
        }
      }

      @Override
      public void onBillingServiceDisconnected() {
        // BillingClient otomatik yeniden bağlanmayı dener; burada ekstra
        // işlem gerekmiyor, bir sonraki çağrı ensureConnected'i tetikler.
      }
    });
  }

  /**
   * Verilen ürün kimliği için satın alma akışını başlatır.
   * JS tarafı: Capacitor.Plugins.PlayBilling.purchase({ productId: 'premium_1ay' })
   */
  @PluginMethod
  public void purchase(PluginCall call) {
    String productId = call.getString("productId");
    if (productId == null || productId.isEmpty()) {
      call.reject("productId gereklidir.");
      return;
    }

    saveCall(call);

    ensureConnected(() -> {
      List<QueryProductDetailsParams.Product> products = new ArrayList<>();
      products.add(
          QueryProductDetailsParams.Product.newBuilder()
              .setProductId(productId)
              .setProductType(BillingClient.ProductType.INAPP)
              .build()
      );
      QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
          .setProductList(products)
          .build();

      billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
        List<ProductDetails> productDetailsList = productDetailsResult.getProductDetailsList();
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
          PluginCall saved = getSavedCall();
          if (saved != null) {
            saved.reject("Ürün Play Console'da bulunamadı veya pasif: " + productId);
            saved.release(bridge);
          }
          return;
        }

        ProductDetails productDetails = productDetailsList.get(0);
        BillingFlowParams.ProductDetailsParams productDetailsParams =
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .build();
        List<BillingFlowParams.ProductDetailsParams> paramsList = new ArrayList<>();
        paramsList.add(productDetailsParams);

        BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(paramsList)
            .build();

        getActivity().runOnUiThread(() -> billingClient.launchBillingFlow(getActivity(), billingFlowParams));
      });
    }, call);
  }

  /**
   * Uygulama açılışında yarım kalmış (örn. onPurchasesUpdated tetiklenmeden
   * uygulama kapanmış) satın almaları tekrar sunucuya göndermek için.
   * JS tarafı: Capacitor.Plugins.PlayBilling.restorePurchases()
   */
  @PluginMethod
  public void restorePurchases(PluginCall call) {
    ensureConnected(() -> {
      QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
          .setProductType(BillingClient.ProductType.INAPP)
          .build();
      billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
        JSObject result = new JSObject();
        List<JSObject> list = new ArrayList<>();
        for (Purchase purchase : purchases) {
          if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            list.add(toJs(purchase));
          }
        }
        result.put("purchases", com.getcapacitor.JSArray.from(list.toArray()));
        call.resolve(result);
      });
    }, call);
  }

  /**
   * Verilen ürün kimlikleri için Google'dan güncel fiyat bilgisini çeker.
   * Play Console'da fiyat değiştiğinde uygulamanın kod değişikliği
   * gerektirmeden otomatik güncel fiyatı göstermesi için kullanılır.
   * JS tarafı: Capacitor.Plugins.PlayBilling.getProductDetails({ productIds: ['premium_1ay', ...] })
   */
  @PluginMethod
  public void getProductDetails(PluginCall call) {
    List<String> productIds = new ArrayList<>();
    com.getcapacitor.JSArray idsParam = call.getArray("productIds");
    if (idsParam == null) {
      call.reject("productIds gereklidir.");
      return;
    }
    try {
      for (Object id : idsParam.toList()) productIds.add(String.valueOf(id));
    } catch (Exception e) {
      call.reject("productIds ayrıştırılamadı.");
      return;
    }
    if (productIds.isEmpty()) {
      call.reject("productIds boş olamaz.");
      return;
    }

    ensureConnected(() -> {
      List<QueryProductDetailsParams.Product> products = new ArrayList<>();
      for (String id : productIds) {
        products.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        );
      }
      QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
          .setProductList(products)
          .build();

      billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
          call.reject("Ürün bilgileri alınamadı: " + billingResult.getDebugMessage());
          return;
        }
        List<JSObject> list = new ArrayList<>();
        for (ProductDetails details : productDetailsResult.getProductDetailsList()) {
          ProductDetails.OneTimePurchaseOfferDetails offer = details.getOneTimePurchaseOfferDetails();
          JSObject obj = new JSObject();
          obj.put("productId", details.getProductId());
          obj.put("title", details.getName());
          obj.put("formattedPrice", offer != null ? offer.getFormattedPrice() : null);
          list.add(obj);
        }
        JSObject result = new JSObject();
        result.put("products", com.getcapacitor.JSArray.from(list.toArray()));
        call.resolve(result);
      });
    }, call);
  }

  @Override
  public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
    PluginCall call = getSavedCall();
    if (call == null) return;

    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
      call.reject("USER_CANCELED", "Kullanıcı satın almayı iptal etti.");
      call.release(bridge);
      return;
    }
    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
      call.reject("Satın alma tamamlanamadı: " + billingResult.getDebugMessage());
      call.release(bridge);
      return;
    }

    Purchase purchase = purchases.get(0);
    // Not: consume işlemini burada YAPMIYORUZ. Consume, sunucu tarafında
    // (verify-play-purchase Edge Function) Google Play Developer API
    // üzerinden yapılıyor — böylece "ödendi ama sunucu hiç doğrulamadı"
    // durumunda token tüketilmeden kalır, kullanıcı mağdur olmaz ve
    // apply_verified_purchase idempotent olduğu için tekrar denenebilir.
    call.resolve(toJs(purchase));
    call.release(bridge);
  }

  private JSObject toJs(Purchase purchase) {
    JSObject obj = new JSObject();
    List<String> productIds = purchase.getProducts();
    obj.put("productId", productIds.isEmpty() ? null : productIds.get(0));
    obj.put("purchaseToken", purchase.getPurchaseToken());
    obj.put("orderId", purchase.getOrderId());
    return obj;
  }
}
