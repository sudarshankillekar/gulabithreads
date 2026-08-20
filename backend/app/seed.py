from .models import CategoryCreate, Order, Product

CATEGORY_NAMES = [
    "Tote bag 18*18",
    "Tote bag 16*16",
    "Toys",
    "Wallets/jewellery pouch",
    "Coin pouch",
    "Keychain",
    "Duffle bag",
    "Handpack bag",
]


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("/", "-")
        .replace("*", "x")
        .replace("&", "and")
        .replace(" ", "-")
        .replace("--", "-")
    )


DEFAULT_CATEGORIES = [
    CategoryCreate(
        name=name,
        slug=slugify(name),
        description=f"Handcrafted {name.lower()} pieces from Gulabi Threads.",
        display_order=index + 1,
    )
    for index, name in enumerate(CATEGORY_NAMES)
]

DEFAULT_PRODUCTS = [
    Product(
        slug="aria-silk-tote",
        name="The Aria Silk Tote",
        price=1250,
        discount_price=0,
        category="Tote bag 18*18",
        color="",
        material="",
        rating=5,
        stock=18,
        badge="New In",
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuBvr13CWsZ_K_29jiTQyodIgHrH8jntRQs_6l72lPc9ncPQfs3TJFaKohb_4vUqPAEHPC30dgHM4dUU3zoV4yEzCmCVG1tGNJvct5SHCy97xz_ppK7PaxhmJegPh72Gv86T_L5fwjubf6ogChm2v-SI89EhPxeMfbbsz2QQQxRpxrxrttuOqhcXQOQcNFTHclGHLLJfQssFx1cWO6u9f_gvPySzgzTuSTQwVwT2NFoGFTVWY0IRlxt2u6td5GbdLcb-Cp-z_7Frw0w",
        gallery=[
            "https://lh3.googleusercontent.com/aida-public/AB6AXuBvr13CWsZ_K_29jiTQyodIgHrH8jntRQs_6l72lPc9ncPQfs3TJFaKohb_4vUqPAEHPC30dgHM4dUU3zoV4yEzCmCVG1tGNJvct5SHCy97xz_ppK7PaxhmJegPh72Gv86T_L5fwjubf6ogChm2v-SI89EhPxeMfbbsz2QQQxRpxrxrttuOqhcXQOQcNFTHclGHLLJfQssFx1cWO6u9f_gvPySzgzTuSTQwVwT2NFoGFTVWY0IRlxt2u6td5GbdLcb-Cp-z_7Frw0w",
            "https://lh3.googleusercontent.com/aida-public/AB6AXuAxl_RViBA13CDtM5g9Is2o0i_58i7uShs9z42epJXrV3cTd1y2U7kknA2hpuRTsKyaZlWFTonksJE562tqwsxoiD73pzw5VsHM4C8szG5ECqo8oM1OiZSbI1GKmHM1mNUCkvjo8vkS3_kBDG45LKd8cFIjKACAh7ov21mT0VGnGB1P32kCwvhDLPE5MA4byRVC7Ka1150FHrZpZas6_IKqelro43GdmsAxu7xeDWDfaPwi4oPA29-uDkY67Xi5oqdf1NwfUPsejZ0",
            "https://lh3.googleusercontent.com/aida-public/AB6AXuCGIsQjy0UfpmdJJX7wG9_ZD8C94ldNhEpdqTqXRdV7eNZ-sVRfhz4w7ePTjWwe4wilbdL7tZ96KaEUST0Mm9N8pq_z0J_tsM9hrnj_1UZGjTLrRL3tqVGvuGE0JMbDsYJXpuDCcVLrHPUwJzSsOoib9GMtEHWXAvfgveqhsQSuvvWTNVIbf5E9Bl4fBWbqlc3gMqWpL2mAzGE3skPUpXnp2-ECLtVRrdJKtcVtzBox0RpJg-4H1FnVcVv8XlFpMK44sOnM6yjLnQs",
        ],
        description="A masterpiece of functional elegance with premium pebbled leather, rose gold hardware, and a silk-lined interior shaped for everyday rituals.",
    ),
    Product(
        slug="weekender-tote",
        name="The Weekender Tote",
        price=450,
        category="Duffle bag",
        color="Espresso",
        material="Full Grain Leather",
        rating=4,
        stock=9,
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuCfl4qj5NBwykoeEaN42FcK5FyOYqdNUS-bDxPgAotbEfQs7E21Tjt-b0IoSRU56q6THkG-eHoyc1zCErm6rght9f86yGVSvCpO0yY-qHrNe5VhtXXoBBu4zyvlrLhyT_F6g4LgwQXdO-vfLtfSxQfsQN3SBGtW5sUIezaeGvuD15LQki7Da8tBDDzAXTuINZfU1X_EqYsv4V0P_KeYR9d8of1NLC98sez8iKnHIDJYzSAbGEmTub5ZGfXJ2K_cH4maRyyH9oYH7uo",
        gallery=[],
        description="A generous carry-all with a sculptural silhouette, reinforced handles, and an interior built for train platforms and long weekends.",
    ),
    Product(
        slug="signature-crossbody",
        name="The Signature Crossbody",
        price=245,
        category="Wallets/jewellery pouch",
        color="Charcoal",
        material="Calfskin",
        rating=4,
        stock=36,
        badge="Limited",
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuCmdwW3DnzEJzAwW5L9cs_0DCYPF0J79BxKEEfU1aXP2tCYe6_pYaF9CttSkhVqErgJqy0JpW-zre77QuJXjt4cfoiCxFRJeRDG82lUK9RchoY2p6fZgHaYIJsZLxR8jX9UDX30005HKnYEFzZRcqkrSgRswJOH6QVnP45kF8K_I5mKYdulOqfnwjyNuSXgPaMTaLRtDiIPvvRtE-9kwKHRqX-b2iKFo6N5nzZ4tznC0zP5YpXFZ-NhsGIXJCE7AaUregAm9qYYGwI",
        gallery=[],
        description="Compact, precise, and quietly polished for days when your essentials need to move lightly.",
    ),
    Product(
        slug="executive-laptop-sleeve",
        name="Executive Laptop Sleeve",
        price=120,
        category="Handpack bag",
        color="Ivory",
        material="Suede",
        rating=4,
        stock=4,
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuBQIUKknV6tmHR0su49XHjnkelG8UmoWKmsxrptAMNBiwR6nQUWUKKHCEZuoGmGS_nzK9wIJHzsR9IiH71-drTSxXTNJIKAd1pt-Z73X25zb722ara4ozSKVud3KFltBxcA_s7Y582fsUmsPjMaduE5Wy6BwIfBuYMm2mL8E30ByNg1VtHP_K5aLXk7G29gfagSy6tH0ie-mwcpZUxT6rA8MEh8VC3hrI-IKf7OHn66n6BooZtqFtIwAgb8LExum7bLsplk2HNGTAo",
        gallery=[],
        description="A soft ivory sleeve with blush stitching and a structured profile for the workday.",
    ),
    Product(
        slug="heritage-silk-tote",
        name="Heritage Silk Tote",
        price=980,
        category="Tote bag 16*16",
        color="Rose Gold",
        material="Silk Blend",
        rating=5,
        stock=2,
        badge="Low Stock",
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuDkVCTTj8-EN4ZmT1IdjnNfeTSLywmVD1dkVPbr-XPDSl5YkHE_7p_k-NM3Jtzia25ZpOeIDWb6YRUET3Noslc6WOyLv3wP-8rtSg9CwRsi7NIGHriAN4W7Nxb_ezGqbVcr9_9LTf292Iev8uBhF6wHmR2_iJw1VyA9tQ3bUGwb-CacqGcYgueKf1CLxE6Y1IGnM0d3baH7UiaV2kGhzMi_6SSk9tA094ehmzc8WnJ1Js6aOFet2gyvHjRVda01l9jlkGBz9-os1Go",
        gallery=[],
        description="Heritage embroidery and a refined tote profile for festive evenings and heirloom gifting.",
    ),
    Product(
        slug="rose-gala-clutch",
        name="Rose Gold Gala Clutch",
        price=380,
        category="Coin pouch",
        color="Rose Gold",
        material="Metallic Leather",
        rating=5,
        stock=12,
        image="https://lh3.googleusercontent.com/aida-public/AB6AXuCsMDu_MKaYkNtD9lwA0BoP4vtWlkJXxRsNcwnIui0BadEoRkis3KkoEiw9_Zb4nH1OXteL6qtzkAJuFg46g0yg5xMzwBSzMhaRl76-JqIJlgrFl49KCqKcj8bGVvV2_nKZAUETavFdSoFIEbY5m0GoqtUNeDYqfgaeD7_NBtgl_Q_mP3bUwub76hFBw8VzmAXiejT010nDCvfYUiv-uvE4-t7p23uXm7EYilxKhV-fEM0krjg4LG4vARZDIIOp0E6Iy8oGJu8nfXc",
        gallery=[],
        description="A laser-cut evening clutch with shimmer, shadow, and just enough room for the essentials.",
    ),
]

for product in DEFAULT_PRODUCTS:
    if not product.gallery:
        product.gallery = [product.image, DEFAULT_PRODUCTS[0].gallery[1], DEFAULT_PRODUCTS[0].gallery[2]]

DEFAULT_ORDERS = [
    Order(id="GT-1048", customer="Anika Rao", items=[{"slug": "aria-silk-tote", "qty": 1}], product="The Aria Silk Tote", total=1250, subtotal=1250, tax=0, shipping_cost=0, status="Processing", date="Jul 12"),
    Order(id="GT-1047", customer="Maya Iyer", items=[{"slug": "heritage-silk-tote", "qty": 1}], product="Heritage Silk Tote", total=980, subtotal=980, tax=0, shipping_cost=0, status="Shipped", date="Jul 11"),
    Order(id="GT-1046", customer="Leela Shah", items=[{"slug": "weekender-tote", "qty": 1}], product="The Weekender Tote", total=450, subtotal=450, tax=0, shipping_cost=0, status="Delivered", date="Jul 10"),
    Order(id="GT-1045", customer="Noor Khan", items=[{"slug": "rose-gala-clutch", "qty": 1}], product="Rose Gold Gala Clutch", total=380, subtotal=380, tax=0, shipping_cost=0, status="Pending", date="Jul 09"),
]


async def seed_database(db) -> None:
    for category in DEFAULT_CATEGORIES:
        await db.categories.update_one(
            {"slug": category.slug},
            {"$setOnInsert": category.model_dump()},
            upsert=True,
        )
    product_seed_state = await db.seed_state.find_one({"key": "default_products"})
    product_count = await db.products.count_documents({})
    if product_seed_state is None and product_count == 0:
        await db.products.insert_many([product.model_dump() for product in DEFAULT_PRODUCTS])
        await db.seed_state.update_one(
            {"key": "default_products"},
            {"$set": {"seeded": True}},
            upsert=True,
        )
    elif product_seed_state is None and product_count > 0:
        await db.seed_state.update_one(
            {"key": "default_products"},
            {"$set": {"seeded": True}},
            upsert=True,
        )
    if await db.orders.count_documents({}) == 0:
        await db.orders.insert_many([order.model_dump() for order in DEFAULT_ORDERS])
