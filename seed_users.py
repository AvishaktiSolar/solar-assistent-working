import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is missing. Add it to your .env file.")

client = MongoClient(MONGO_URI)
db = client["avishakti_solar"]
users = db["users"]

seed_data = [
    {
        "username": "avishaktiSolar",
        "password": "avishaktiSolar2025",
        "role": "admin",
    },
    {
        "username": "procure",
        "password": "procure2025",
        "role": "procurement",
    },
]

for user in seed_data:
    existing = users.find_one({"username": user["username"]})
    if existing:
        users.update_one(
            {"_id": existing["_id"]},
            {"$set": {"password": user["password"], "role": user["role"]}},
        )
        print(f"Updated user: {user['username']}")
    else:
        users.insert_one(user)
        print(f"Inserted user: {user['username']}")

print("User seeding completed.")
