const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, "books.json");

app.use(cors());
app.use(express.json());

function readBooks() {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeBooks(books) {
    fs.writeFileSync(DB_FILE, JSON.stringify(books, null, 2));
}

app.get("/api/health", (req, res) => {
    res.json({ service: "book-service", status: "ok" });
});

app.get("/api/books", (req, res) => {
    res.json(readBooks());
});

app.get("/api/books/:id", (req, res) => {
    const books = readBooks();
    const book = books.find((item) => String(item.id) === String(req.params.id));

    if (!book) {
        return res.status(404).json({ message: "Buku tidak ditemukan." });
    }

    res.json(book);
});

app.post("/api/books", (req, res) => {
    const books = readBooks();
    const { id, title, author, category, available = true } = req.body;

    if (!id || !title || !author) {
        return res.status(400).json({
            message: "id, title, dan author wajib diisi."
        });
    }

    if (books.some((book) => String(book.id) === String(id))) {
        return res.status(409).json({ message: "ID buku sudah digunakan." });
    }

    const book = {
        id: String(id),
        title,
        author,
        category: category || "",
        available: Boolean(available)
    };

    books.push(book);
    writeBooks(books);

    res.status(201).json(book);
});

app.patch("/api/books/:id/status", (req, res) => {
    const books = readBooks();
    const book = books.find((item) => String(item.id) === String(req.params.id));

    if (!book) {
        return res.status(404).json({ message: "Buku tidak ditemukan." });
    }

    if (typeof req.body.available !== "boolean") {
        return res.status(400).json({
            message: "Field available harus bernilai boolean."
        });
    }

    book.available = req.body.available;
    writeBooks(books);

    res.json(book);
});

app.listen(PORT, () => {
    console.log(`Book Service berjalan di http://localhost:${PORT}`);
});
