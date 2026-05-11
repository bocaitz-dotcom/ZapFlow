from server import db


async def get_template_by_name(name: str, user_id: str):
    return await db.templates.find_one(
        {"name": name, "user_id": user_id},
        {"_id": 0}
    )