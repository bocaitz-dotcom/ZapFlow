import re

def render_template(content: str, variables: dict) -> str:
    def replace(match):
        key = match.group(1)
        return variables.get(key, f"{{{{{key}}}}}")

    pattern = r"\{\{(\w+)\}\}"
    return re.sub(pattern, replace, content)