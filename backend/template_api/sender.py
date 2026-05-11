from template_api.templates import render_template
from template_api.template_repository import get_template_by_name
from wa_client import send_message  # o seu real


async def send_from_template(phone: str, template_name: str, variables: dict):
    template = get_template_by_name(template_name)

    if not template:
        raise Exception("Template não encontrado")

    message = render_template(template.content, variables)

    await send_message(phone, message)

    return message