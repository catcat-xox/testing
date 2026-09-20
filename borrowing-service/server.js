const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, "data.json");
const BOOK_SERVICE_URL = "http://localhost:3002/api";

const MAX_ACTIVE_LOANS = 3;
const BORROWING_DAYS = 7;

app.use(cors());
app.use(express.json());

function readData() {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function toDateOnly(date) {
    return date.toISOString().slice(0, 10);
}

app.get("/api/health", (req, res) => {
    res.json({ service: "borrowing-service", status: "ok" });
});

app.post("/api/auth/login", (req, res) => {
    const { studentId, password } = req.body;
    const data = readData();

    const user = data.users.find(
        (item) =>
            String(item.studentId) === String(studentId) &&
            String(item.password) === String(password)
    );

    if (!user) {
        return res.status(401).json({
            message: "NIM atau password salah."
        });
    }

    res.json({
        message: "Login berhasil.",
        user: {
            studentId: user.studentId,
            name: user.name
        }
    });
});

app.get("/api/borrowings/student/:studentId", (req, res) => {
    const data = readData();
    const borrowings = data.borrowings.filter(
        (item) => String(item.studentId) === String(req.params.studentId)
    );

    const activeCount = borrowings.filter(
        (item) => item.status === "borrowed"
    ).length;

    res.json({
        borrowings,
        activeCount
    });
});

// Alias agar kompatibel dengan spesifikasi frontend yang menggunakan /user/:userId.
app.get("/api/borrowings/user/:userId", (req, res) => {
    const data = readData();
    const borrowings = data.borrowings.filter(
        (item) => String(item.studentId) === String(req.params.userId)
    );

    const activeCount = borrowings.filter(
        (item) => item.status === "borrowed"
    ).length;

    res.json({
        borrowings,
        activeCount
    });
});

app.post("/api/borrowings", async (req, res) => {
    const { studentId, bookId } = req.body;

    if (!studentId || !bookId) {
        return res.status(400).json({
            message: "studentId dan bookId wajib diisi."
        });
    }

    const data = readData();

    const user = data.users.find(
        (item) => String(item.studentId) === String(studentId)
    );

    if (!user) {
        return res.status(404).json({
            message: "Mahasiswa tidak ditemukan."
        });
    }

    const activeCount = data.borrowings.filter(
        (item) =>
            String(item.studentId) === String(studentId) &&
            item.status === "borrowed"
    ).length;

    if (activeCount >= MAX_ACTIVE_LOANS) {
        return res.status(409).json({
            reason: "Maksimal 3 buku aktif. Kembalikan salah satu buku terlebih dahulu."
        });
    }

    let book;

    try {
        const response = await axios.get(
            `${BOOK_SERVICE_URL}/books/${encodeURIComponent(bookId)}`
        );
        book = response.data;
    } catch (error) {
        const status = error.response?.status || 500;
        return res.status(status).json({
            reason:
                error.response?.data?.message ||
                "Gagal mengambil data buku dari Book Service."
        });
    }

    if (!book.available) {
        return res.status(409).json({
            reason: "Buku sedang dipinjam / tidak tersedia."
        });
    }

    try {
        await axios.patch(
            `${BOOK_SERVICE_URL}/books/${encodeURIComponent(bookId)}/status`,
            { available: false }
        );
    } catch (error) {
        return res.status(502).json({
            reason: "Gagal memperbarui status buku."
        });
    }

    const now = new Date();
    const borrowing = {
        id: `BR${Date.now()}`,
        studentId: String(studentId),
        bookId: String(bookId),
        tanggalPinjam: toDateOnly(now),
        batasPengembalian: toDateOnly(addDays(now, BORROWING_DAYS)),
        status: "borrowed"
    };

    data.borrowings.push(borrowing);
    writeData(data);

    res.status(201).json({
        message: "Peminjaman berhasil.",
        borrowing
    });
});

app.patch("/api/borrowings/:id", async (req, res) => {
    const data = readData();
    const borrowing = data.borrowings.find(
        (item) => String(item.id) === String(req.params.id)
    );

    if (!borrowing) {
        return res.status(404).json({
            message: "Data peminjaman tidak ditemukan."
        });
    }

    if (req.body.status !== "returned") {
        return res.status(400).json({
            message: "Status pengembalian harus 'returned'."
        });
    }

    if (borrowing.status === "returned") {
        return res.status(409).json({
            message: "Buku sudah dikembalikan."
        });
    }

    try {
        await axios.patch(
            `${BOOK_SERVICE_URL}/books/${encodeURIComponent(borrowing.bookId)}/status`,
            { available: true }
        );
    } catch (error) {
        return res.status(502).json({
            message: "Gagal memperbarui status buku."
        });
    }

    borrowing.status = "returned";
    borrowing.tanggalDikembalikan = toDateOnly(new Date());
    writeData(data);

    res.json({
        message: "Buku berhasil dikembalikan.",
        borrowing
    });
});

app.listen(PORT, () => {
    console.log(`Borrowing Service berjalan di http://localhost:${PORT}`);
});
