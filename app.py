from flask import Flask, render_template, request, redirect, url_for
import uuid
from datetime import datetime

app = Flask(__name__)

# In-memory stock data
stock = [
    {
        "id": str(uuid.uuid4()),
        "name": "Laptop",
        "category": "Electronics",
        "quantity": 50,
        "price": 999.99,
        "date_added": datetime.now().strftime("%Y-%m-%d"),
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Mouse",
        "category": "Electronics",
        "quantity": 200,
        "price": 25.99,
        "date_added": datetime.now().strftime("%Y-%m-%d"),
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Notebook",
        "category": "Stationery",
        "quantity": 500,
        "price": 3.99,
        "date_added": datetime.now().strftime("%Y-%m-%d"),
    },
]


@app.route("/")
def index():
    search = request.args.get("search", "")
    category_filter = request.args.get("category", "")

    filtered = stock
    if search:
        filtered = [i for i in filtered if search.lower() in i["name"].lower()]
    if category_filter:
        filtered = [i for i in filtered if i["category"] == category_filter]

    categories = list(set(i["category"] for i in stock))
    total_items = sum(i["quantity"] for i in stock)
    total_value = sum(i["quantity"] * i["price"] for i in stock)

    return render_template(
        "index.html",
        stock=filtered,
        categories=categories,
        search=search,
        category_filter=category_filter,
        total_items=total_items,
        total_value=total_value,
    )


@app.route("/add", methods=["GET", "POST"])
def add():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        category = request.form.get("category", "").strip()
        quantity = request.form.get("quantity", "")
        price = request.form.get("price", "")

        if not name or not category or not quantity or not price:
            return render_template("add.html", error="All fields are required.")

        try:
            qty = int(quantity)
            pr = float(price)
        except ValueError:
            return render_template("add.html", error="Invalid quantity or price.")

        stock.append(
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "category": category,
                "quantity": qty,
                "price": pr,
                "date_added": datetime.now().strftime("%Y-%m-%d"),
            }
        )
        return redirect(url_for("index"))

    return render_template("add.html")


@app.route("/remove/<item_id>", methods=["POST"])
def remove(item_id):
    qty_to_remove = int(request.form.get("quantity", 1))

    for item in stock:
        if item["id"] == item_id:
            if qty_to_remove >= item["quantity"]:
                stock.remove(item)
            else:
                item["quantity"] -= qty_to_remove
            break

    return redirect(url_for("index"))


@app.route("/delete/<item_id>", methods=["POST"])
def delete(item_id):
    global stock
    stock = [i for i in stock if i["id"] != item_id]
    return redirect(url_for("index"))


@app.route("/edit/<item_id>", methods=["GET", "POST"])
def edit(item_id):
    item = next((i for i in stock if i["id"] == item_id), None)
    if not item:
        return redirect(url_for("index"))

    if request.method == "POST":
        item["name"] = request.form.get("name", item["name"]).strip()
        item["category"] = request.form.get("category", item["category"]).strip()
        try:
            item["quantity"] = int(request.form.get("quantity", item["quantity"]))
            item["price"] = float(request.form.get("price", item["price"]))
        except ValueError:
            pass
        return redirect(url_for("index"))

    return render_template("edit.html", item=item)


if __name__ == "__main__":
    app.run(debug=True, port=3000)
