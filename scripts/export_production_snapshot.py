#!/usr/bin/env python3
"""Canlı Supabase veritabanından supabase/export/production/ anlık görüntüsünü
yeniden üretir.

Kullanım:
    export DATABASE_URL="postgresql://postgres:[ŞİFRE]@db.<proje-ref>.supabase.co:5432/postgres"
    python3 scripts/export_production_snapshot.py

DATABASE_URL'i nereden bulursun:
    Supabase Dashboard -> Project Settings -> Database -> Connection string
    -> "URI" sekmesi (Direct connection, "Use connection pooling" KAPALI).
    [ŞİFRE] kısmına veritabanı şifreni yaz.

Bu script sadece içerik tablolarını (kullanıcıya ait olmayan) dışa aktarır:
categories, topics, questions, card_decks, card_questions, flashcards,
exam_topics, exam_kadrolar, exam_blueprint_items, denemeler, deneme_questions.

Büyük tablolar (questions, deneme_questions, flashcards) mevcut kuralla aynı
şekilde 200'lük parçalara (ör. questions-001.json, questions-002.json...)
bölünür; script eski parça dosyalarını siler ki numaralandırma değişirse eski
artıklar kalmasın.
"""
import json
import os
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2 eksik. Kurmak için: pip install psycopg2-binary")

ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = ROOT / "supabase" / "export" / "production"
BATCH_SIZE = 200

# (tablo adı, sıralama sütunu, tek dosya mı yoksa parçalı mı)
SINGLE_FILE_TABLES = [
    ("categories", "sort_order"),
    ("topics", "id"),
    ("card_decks", "sort_order"),
    ("card_questions", "sort_order"),
    ("exam_topics", "sort_order"),
    ("exam_kadrolar", "kadro"),
    ("exam_blueprint_items", "id"),
    ("denemeler", "id"),
]
CHUNKED_TABLES = [
    ("questions", "id"),
    ("flashcards", "deck_id, sort_order"),
    ("deneme_questions", "id"),
]


def rows_to_json_safe(rows):
    out = []
    for row in rows:
        clean = {}
        for key, value in dict(row).items():
            # datetime / UUID gibi tipleri JSON'a uygun stringe çevir
            if hasattr(value, "isoformat"):
                clean[key] = value.isoformat()
            else:
                clean[key] = value
        out.append(clean)
    return out


def dump_single(cur, table, order_by):
    cur.execute(f"SELECT * FROM public.{table} ORDER BY {order_by}")
    rows = rows_to_json_safe(cur.fetchall())
    path = EXPORT_DIR / f"{table}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {table}.json  -> {len(rows)} satır")


def dump_chunked(cur, table, order_by):
    cur.execute(f"SELECT * FROM public.{table} ORDER BY {order_by}")
    rows = rows_to_json_safe(cur.fetchall())
    # Eski parça dosyalarını temizle (sayı azaldıysa artık kalmasın)
    for old in EXPORT_DIR.glob(f"{table}-*.json"):
        old.unlink()
    total_chunks = 0
    for index in range(0, len(rows), BATCH_SIZE):
        chunk = rows[index:index + BATCH_SIZE]
        total_chunks += 1
        path = EXPORT_DIR / f"{table}-{total_chunks:03d}.json"
        path.write_text(json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {table}-*.json -> {len(rows)} satır, {total_chunks} parça")


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL ortam değişkeni tanımlı değil. Yukarıdaki dosya başındaki açıklamaya bak.")
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Bağlanılıyor... ({EXPORT_DIR} altına yazılacak)")
    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for table, order_by in SINGLE_FILE_TABLES:
                dump_single(cur, table, order_by)
            for table, order_by in CHUNKED_TABLES:
                dump_chunked(cur, table, order_by)
    finally:
        conn.close()
    print("\nBitti. Şimdi kontrol için:")
    print("  python3 scripts/generate_seed.py")
    print("Hatasız çalışırsa supabase/seed.sql güncellenmiş demektir.")


if __name__ == "__main__":
    main()
