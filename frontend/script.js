const API = {
    borrowing: "http://localhost:3001/api",
    books: "http://localhost:3002/api"
};

const BORROWING_DAYS = 7;
const MAX_ACTIVE_LOANS = 3;

// Session user is intentionally kept only in application memory.
// No localStorage/sessionStorage is used.
let currentUser = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
    bindEvents();
    showLogin();
}

function bindEvents() {
    document.getElementById("loginForm").addEventListener("submit", handleLogin);
    document.getElementById("logoutButton").addEventListener("click", handleLogout);

    document.querySelectorAll(".nav-link").forEach((button) => {
        button.addEventListener("click", () => switchSection(button.dataset.section));
    });
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data.reason ||
            data.message ||
            `Request gagal dengan status ${response.status}.`
        );
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

async function handleLogin(event) {
    event.preventDefault();

    const nim = document.getElementById("nim").value.trim();
    const password = document.getElementById("password").value;
    const message = document.getElementById("loginMessage");

    if (!nim || !password) {
        message.textContent = "NIM dan password wajib diisi.";
        return;
    }

    try {
        const result = await apiRequest(`${API.borrowing}/auth/login`, {
            method: "POST",
            body: JSON.stringify({
                studentId: nim,
                password
            })
        });

        // Keep only the authenticated user in application memory.
        currentUser = {
            studentId: result.user.studentId,
            name: result.user.name
        };

        message.textContent = "";
        document.getElementById("loginForm").reset();

        await showApp(currentUser);
    } catch (error) {
        message.textContent = error.message || "Login gagal.";
    }
}

function handleLogout() {
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById("loginPage").classList.remove("hidden");
    document.getElementById("appPage").classList.add("hidden");
    document.getElementById("loginMessage").textContent = "";
}

async function showApp(user) {
    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("appPage").classList.remove("hidden");
    document.getElementById("userName").textContent = user.name;

    switchSection("booksSection");

    try {
        await renderBooks();
        await renderLoans();
    } catch (error) {
        showAppMessage(
            `Gagal memuat data. Pastikan Book Service (3002) dan Borrowing Service (3001) sedang berjalan. ${error.message}`
        );
    }
}

function switchSection(sectionId) {
    document.querySelectorAll(".app-section").forEach((section) => {
        section.classList.toggle("hidden", section.id !== sectionId);
    });

    document.querySelectorAll(".nav-link").forEach((button) => {
        button.classList.toggle(
            "active",
            button.dataset.section === sectionId
        );
    });

    clearAppMessage();

    if (sectionId === "booksSection" && currentUser) {
        renderBooks().catch((error) => showAppMessage(error.message));
    }

    if (sectionId === "loansSection" && currentUser) {
        renderLoans().catch((error) => showAppMessage(error.message));
    }
}

async function renderBooks() {
    if (!currentUser) {
        showLogin();
        return;
    }

    const [books, loanData] = await Promise.all([
        apiRequest(`${API.books}/books`),
        apiRequest(`${API.borrowing}/borrowings/student/${encodeURIComponent(currentUser.studentId)}`)
    ]);

    const activeLoanCount = Number.isInteger(loanData.activeCount)
        ? loanData.activeCount
        : (loanData.borrowings || []).filter(
            (loan) => loan.status === "borrowed"
        ).length;

    updateLoanCounters(activeLoanCount);

    const bookList = document.getElementById("bookList");

    if (!Array.isArray(books) || books.length === 0) {
        bookList.innerHTML = `
            <div class="empty-state">
                Belum ada buku dalam katalog.
            </div>
        `;
        return;
    }

    bookList.innerHTML = books.map((book) => {
        const isAvailable = getBookAvailability(book);

        return `
            <article class="book-card">
                <img
                    class="book-cover"
                    src="${escapeAttribute(book.sampul || "https://placehold.co/600x800?text=Buku")}"
                    alt="Sampul ${escapeHtml(book.judul || book.title || "Buku")}"
                    onerror="this.src='https://placehold.co/600x800?text=Buku'"
                >
                <div class="book-content">
                    <h2 class="book-title">${escapeHtml(book.judul || book.title || "Tanpa Judul")}</h2>
                    <p class="book-author">Penulis: ${escapeHtml(book.penulis || book.author || "-")}</p>
                    <span class="status ${isAvailable ? "available" : "borrowed"}">
                        ${isAvailable ? "Tersedia" : "Dipinjam"}
                    </span>
                    <button
                        class="btn btn-primary"
                        type="button"
                        data-borrow-id="${escapeAttribute(book.id)}"
                        ${isAvailable ? "" : "disabled"}
                    >
                        ${isAvailable ? "Pinjam" : "Tidak Tersedia"}
                    </button>
                </div>
            </article>
        `;
    }).join("");

    bookList.querySelectorAll("[data-borrow-id]").forEach((button) => {
        button.addEventListener("click", () => {
            borrowBook(button.dataset.borrowId);
        });
    });
}

function getBookAvailability(book) {
    // Supports the Book Service schema:
    // available: true/false
    if (typeof book.available === "boolean") {
        return book.available;
    }

    // Compatibility with the old frontend field:
    // status: "Tersedia" / "Dipinjam"
    return String(book.status || "").toLowerCase() === "tersedia";
}

async function borrowBook(bookId) {
    if (!currentUser) {
        showLogin();
        return;
    }

    const buttons = document.querySelectorAll(`[data-borrow-id="${CSS.escape(String(bookId))}"]`);
    buttons.forEach((button) => {
        button.disabled = true;
    });

    try {
        const result = await apiRequest(`${API.borrowing}/borrowings`, {
            method: "POST",
            body: JSON.stringify({
                studentId: currentUser.studentId,
                bookId: String(bookId)
            })
        });

        showAppMessage(
            result.message ||
            "Peminjaman berhasil. Batas pengembalian 7 hari."
        );

        await renderBooks();
        await renderLoans();
    } catch (error) {
        let message = error.message || "Peminjaman gagal.";

        if (error.status === 409) {
            message = error.data?.reason || message;
        }

        showAppMessage(`Peminjaman ditolak. ${message}`);
        await renderBooks().catch(() => {});
    } finally {
        buttons.forEach((button) => {
            button.disabled = getButtonShouldBeDisabled(button);
        });
    }
}

function getButtonShouldBeDisabled(button) {
    return button.disabled;
}

async function renderLoans() {
    if (!currentUser) {
        return;
    }

    const result = await apiRequest(
        `${API.borrowing}/borrowings/student/${encodeURIComponent(currentUser.studentId)}`
    );

    const loans = Array.isArray(result.borrowings) ? result.borrowings : [];

    // The Borrowing Service is the source of truth for transactions.
    const activeLoans = loans.filter((loan) => loan.status === "borrowed");

    updateLoanCounters(activeLoans.length);

    const loanList = document.getElementById("loanList");

    if (activeLoans.length === 0) {
        loanList.innerHTML = `
            <div class="empty-state">
                Belum ada buku yang sedang dipinjam.
            </div>
        `;
        return;
    }

    // Book metadata is owned by Book Service, so retrieve it through its API.
    const bookResults = await Promise.all(
        activeLoans.map(async (loan) => {
            try {
                return {
                    loan,
                    book: await apiRequest(
                        `${API.books}/books/${encodeURIComponent(loan.bookId)}`
                    )
                };
            } catch (error) {
                return { loan, book: null };
            }
        })
    );

    loanList.innerHTML = bookResults.map(({ loan, book }) => {
        const title = book?.judul || book?.title || `Buku ${loan.bookId}`;
        const author = book?.penulis || book?.author || "-";
        const borrowDate = loan.tanggalPinjam || loan.borrowDate;
        const dueDate = loan.batasPengembalian || loan.dueDate;

        return `
            <article class="loan-card">
                <div>
                    <h2>${escapeHtml(title)}</h2>
                    <p>Penulis: ${escapeHtml(author)}</p>
                    <p>Tanggal peminjaman: ${formatDateDisplay(borrowDate)}</p>
                    <p>Batas pengembalian: <strong>${formatDateDisplay(dueDate)}</strong></p>
                </div>
            </article>
        `;
    }).join("");
}

function updateLoanCounters(count) {
    document.getElementById("loanCounter").textContent =
        `Peminjaman: ${count} / ${MAX_ACTIVE_LOANS}`;

    document.getElementById("loanCounterDetail").textContent =
        `Peminjaman: ${count} / ${MAX_ACTIVE_LOANS}`;
}

function formatDateDisplay(dateString) {
    if (!dateString) {
        return "-";
    }

    const parts = String(dateString).split("-");

    if (parts.length !== 3) {
        return String(dateString);
    }

    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

function showAppMessage(text) {
    const element = document.getElementById("appMessage");
    element.textContent = text;
    element.classList.remove("hidden");

    window.clearTimeout(showAppMessage.timer);
    showAppMessage.timer = window.setTimeout(clearAppMessage, 3500);
}

function clearAppMessage() {
    const element = document.getElementById("appMessage");
    element.textContent = "";
    element.classList.add("hidden");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
