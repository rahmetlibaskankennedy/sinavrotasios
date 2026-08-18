#!/usr/bin/env python3
"""Canlıda doğrulanmış içerik anlık görüntüsünden idempotent seed.sql üretir.

Kullanım:
    python3 scripts/generate_seed.py
    python3 scripts/generate_seed.py --check

`supabase/export/production/` yalnızca kullanıcıya ait olmayan içerik
tablolarını içerir. Profiller, deneme hakları ve geri bildirimler bu seed'e
bilinçli olarak dahil edilmez.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "supabase" / "export" / "production"
SEED = ROOT / "supabase" / "seed.sql"
BATCH_SIZE = 200


def load(name: str) -> list[dict]:
    path = EXPORT / name
    if not path.exists():
        raise SystemExit(f"Eksik üretim anlık görüntüsü: {path.relative_to(ROOT)}")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Beklenmeyen JSON biçimi: {path.relative_to(ROOT)}")
    return data


def load_chunks(prefix: str) -> list[dict]:
    files = sorted(EXPORT.glob(f"{prefix}-*.json"))
    if not files:
        raise SystemExit(f"Eksik üretim anlık görüntüsü: {prefix}-*.json")
    rows: list[dict] = []
    for path in files:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, list):
            raise SystemExit(f"Beklenmeyen JSON biçimi: {path.relative_to(ROOT)}")
        rows.extend(data)
    return rows


def text(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def number(value) -> str:
    return "NULL" if value is None else str(int(value))


def boolean(value) -> str:
    return "true" if value else "false"


def jsonb(value) -> str:
    if value is None:
        return "NULL"
    return text(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def text_array(value) -> str:
    if not value:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(text(item) for item in value) + "]::text[]"


def chunks(rows: list[dict]):
    for index in range(0, len(rows), BATCH_SIZE):
        yield rows[index:index + BATCH_SIZE]


def add_upsert(out: list[str], table: str, columns: list[str], rows: list[dict], values, conflict: str, updates: list[str], overriding_identity: bool = False) -> None:
    if not rows:
        return
    for group in chunks(rows):
        identity = " overriding system value" if overriding_identity else ""
        out.append(f"insert into public.{table} ({', '.join(columns)}){identity} values")
        out.append(",\n".join("  (" + ", ".join(values(row)) + ")" for row in group))
        out.append(f"on conflict {conflict} do update set " + ", ".join(updates) + ";")
        out.append("")


def ordered_topics(rows: list[dict]) -> list[dict]:
    pending = {row["id"]: row for row in rows}
    emitted: list[dict] = []
    known: set[str] = set()
    while pending:
        ready = [row for row in pending.values() if not row.get("parent_id") or row["parent_id"] in known]
        if not ready:
            dangling = ", ".join(sorted(pending)[:5])
            raise SystemExit(f"Topics hiyerarşisinde çözülemeyen ebeveyn ilişkisi: {dangling}")
        for row in sorted(ready, key=lambda item: (item.get("sort_order", 0), item["id"])):
            emitted.append(row)
            known.add(row["id"])
            del pending[row["id"]]
    return emitted


def render() -> tuple[str, dict[str, int]]:
    categories = load("categories.json")
    topics = ordered_topics(load("topics.json"))
    questions = load_chunks("questions")
    card_decks = load("card_decks.json")
    card_questions = load("card_questions.json")
    flashcards = load_chunks("flashcards")
    exam_topics = load("exam_topics.json")
    exam_kadrolar = load("exam_kadrolar.json")
    blueprint_items = load("exam_blueprint_items.json")
    denemeler = load("denemeler.json")
    deneme_questions = load_chunks("deneme_questions")

    out = [
        "-- Otomatik üretildi: scripts/generate_seed.py",
        "-- Kaynak: Supabase production içerik anlık görüntüsü (2026-08-13).",
        "-- Kullanıcı verileri (profiles, topic_free_attempts, question_feedback) bu dosyada yoktur.",
        "begin;",
        "",
    ]

    add_upsert(out, "categories",
        ["id", "title", "subtitle", "icon", "icon_class", "sort_order"], categories,
        lambda r: [text(r["id"]), text(r.get("title")), text(r.get("subtitle")), text(r.get("icon")), text(r.get("icon_class")), number(r.get("sort_order"))],
        "(id)", ["title=excluded.title", "subtitle=excluded.subtitle", "icon=excluded.icon", "icon_class=excluded.icon_class", "sort_order=excluded.sort_order"])

    add_upsert(out, "topics",
        ["id", "category_id", "parent_id", "type", "title", "document_number", "article_range", "article_count", "question_count", "kadrolar", "sort_order", "source_file", "summary", "key_points", "show_in_catalog"], topics,
        lambda r: [text(r["id"]), text(r.get("category_id")), text(r.get("parent_id")), text(r.get("type")), text(r.get("title")), text(r.get("document_number")), text(r.get("article_range")), number(r.get("article_count")), number(r.get("question_count")), text_array(r.get("kadrolar")), number(r.get("sort_order")), text(r.get("source_file")), text(r.get("summary")), text_array(r.get("key_points")), boolean(r.get("show_in_catalog", True))],
        "(id)", ["category_id=excluded.category_id", "parent_id=excluded.parent_id", "type=excluded.type", "title=excluded.title", "document_number=excluded.document_number", "article_range=excluded.article_range", "article_count=excluded.article_count", "question_count=excluded.question_count", "kadrolar=excluded.kadrolar", "sort_order=excluded.sort_order", "source_file=excluded.source_file", "summary=excluded.summary", "key_points=excluded.key_points", "show_in_catalog=excluded.show_in_catalog"])

    add_upsert(out, "questions",
        ["id", "topic_id", "prompt", "options", "answer_index", "explanation", "sort_order"], questions,
        lambda r: [text(r["id"]), text(r.get("topic_id")), text(r.get("prompt")), jsonb(r.get("options")), number(r.get("answer_index")), text(r.get("explanation")), number(r.get("sort_order"))],
        "(id)", ["topic_id=excluded.topic_id", "prompt=excluded.prompt", "options=excluded.options", "answer_index=excluded.answer_index", "explanation=excluded.explanation", "sort_order=excluded.sort_order"])

    add_upsert(out, "card_decks",
        ["id", "title", "deck_type", "category_id", "sort_order", "source_file"], card_decks,
        lambda r: [text(r["id"]), text(r.get("title")), text(r.get("deck_type")), text(r.get("category_id")), number(r.get("sort_order")), text(r.get("source_file"))],
        "(id)", ["title=excluded.title", "deck_type=excluded.deck_type", "category_id=excluded.category_id", "sort_order=excluded.sort_order", "source_file=excluded.source_file"])

    add_upsert(out, "card_questions",
        ["id", "deck_id", "prompt", "options", "answer_index", "sort_order"], card_questions,
        lambda r: [text(r["id"]), text(r.get("deck_id")), text(r.get("prompt")), jsonb(r.get("options")), number(r.get("answer_index")), number(r.get("sort_order"))],
        "(id)", ["deck_id=excluded.deck_id", "prompt=excluded.prompt", "options=excluded.options", "answer_index=excluded.answer_index", "sort_order=excluded.sort_order"])

    add_upsert(out, "flashcards",
        ["deck_id", "question", "answer", "sort_order"], flashcards,
        lambda r: [text(r.get("deck_id")), text(r.get("question")), text(r.get("answer")), number(r.get("sort_order"))],
        "(deck_id, sort_order)", ["question=excluded.question", "answer=excluded.answer"])

    add_upsert(out, "exam_topics",
        ["topic_id", "title", "category_id", "status", "question_source", "linked_topic_id", "card_deck_id", "sort_order"], exam_topics,
        lambda r: [text(r["topic_id"]), text(r.get("title")), text(r.get("category_id")), text(r.get("status")), text(r.get("question_source")), text(r.get("linked_topic_id")), text(r.get("card_deck_id")), number(r.get("sort_order"))],
        "(topic_id)", ["title=excluded.title", "category_id=excluded.category_id", "status=excluded.status", "question_source=excluded.question_source", "linked_topic_id=excluded.linked_topic_id", "card_deck_id=excluded.card_deck_id", "sort_order=excluded.sort_order"])

    add_upsert(out, "exam_kadrolar", ["kadro", "duration_minutes"], exam_kadrolar,
        lambda r: [text(r["kadro"]), number(r.get("duration_minutes"))], "(kadro)", ["duration_minutes=excluded.duration_minutes"])

    add_upsert(out, "exam_blueprint_items", ["kadro", "topic_id", "question_count", "sort_order"], blueprint_items,
        lambda r: [text(r.get("kadro")), text(r.get("topic_id")), number(r.get("question_count")), number(r.get("sort_order"))],
        "(kadro, topic_id)", ["question_count=excluded.question_count", "sort_order=excluded.sort_order"])

    add_upsert(out, "denemeler", ["id", "title", "kadro", "duration_minutes", "is_published", "sort_order"], denemeler,
        lambda r: [number(r["id"]), text(r.get("title")), text(r.get("kadro")), number(r.get("duration_minutes")), boolean(r.get("is_published")), number(r.get("sort_order"))],
        "(id)", ["title=excluded.title", "kadro=excluded.kadro", "duration_minutes=excluded.duration_minutes", "is_published=excluded.is_published", "sort_order=excluded.sort_order"], overriding_identity=True)

    add_upsert(out, "deneme_questions", ["id", "deneme_id", "prompt", "options", "answer_index", "sort_order"], deneme_questions,
        lambda r: [number(r["id"]), number(r.get("deneme_id")), text(r.get("prompt")), jsonb(r.get("options")), number(r.get("answer_index")), number(r.get("sort_order"))],
        "(id)", ["deneme_id=excluded.deneme_id", "prompt=excluded.prompt", "options=excluded.options", "answer_index=excluded.answer_index", "sort_order=excluded.sort_order"], overriding_identity=True)

    out.extend([
        "select setval(pg_get_serial_sequence('public.denemeler', 'id'), coalesce((select max(id) from public.denemeler), 1), true);",
        "select setval(pg_get_serial_sequence('public.deneme_questions', 'id'), coalesce((select max(id) from public.deneme_questions), 1), true);",
        "commit;",
        "",
    ])
    counts = {
        "categories": len(categories), "topics": len(topics), "questions": len(questions),
        "card_decks": len(card_decks), "card_questions": len(card_questions), "flashcards": len(flashcards),
        "exam_topics": len(exam_topics), "exam_kadrolar": len(exam_kadrolar),
        "exam_blueprint_items": len(blueprint_items), "denemeler": len(denemeler), "deneme_questions": len(deneme_questions),
    }
    return "\n".join(out), counts


def main() -> None:
    sql, counts = render()
    if sys.argv[1:] == ["--check"]:
        if not SEED.exists() or SEED.read_text(encoding="utf-8") != sql:
            raise SystemExit("seed.sql güncel değil; python3 scripts/generate_seed.py çalıştırın.")
        print("seed.sql güncel.")
        return
    if len(sys.argv) > 1:
        raise SystemExit("Kullanım: python3 scripts/generate_seed.py [--check]")
    SEED.write_text(sql, encoding="utf-8")
    print(f"Yazıldı: {SEED.relative_to(ROOT)}")
    for table, count in counts.items():
        print(f"  {table}: {count}")


if __name__ == "__main__":
    main()
