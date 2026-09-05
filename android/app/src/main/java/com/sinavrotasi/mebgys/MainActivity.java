package com.sinavrotasi.mebgys;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PlayBillingPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
