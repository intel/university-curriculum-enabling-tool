from . import constants


def set_language(lang: str):
    lang = (lang or "en").lower()
    constants.GLOBAL_LANG = "id" if lang == "id" else "en"


def t(key: str, **kwargs):
    label = constants.LABELS.get(constants.GLOBAL_LANG, {}).get(key, key)
    if isinstance(label, dict):
        return label
    return label.format(**kwargs) if kwargs else label
