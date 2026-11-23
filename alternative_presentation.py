"""Formatting repair for copies made by the former AI extraction workflow."""
import re


def normalize_legacy_reference(text):
    text = re.sub(r'[ \t]*[,，]?[ \t]+(?=#{2,6}\s+\S)', '\n', text)
    # The name and description must occupy different lines in setting cards.
    return re.sub(r'(?m)^(#{2,6}\s+[^:\n：]+)[:：][ \t]*(?=\S)', r'\1\n설명: ', text)


def normalize_legacy_plan(text):
    text = text.replace('**', '')
    return re.sub(
        r'[ \t]+(?=(?:#{1,6}\s*)?(?:작품 제목|제목|장르|로그라인|키워드|소재 키워드|총 회차|회차 목표)\s*[:：])',
        '\n', text)
