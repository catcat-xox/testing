# TESTING

## Health check
- GET http://localhost:3001/api/health
- GET http://localhost:3002/api/health

## Login
POST http://localhost:3001/api/auth/login
```json
{
  "studentId": "2310001",
  "password": "12345"
}
```

## Catalog
GET http://localhost:3002/api/books

## History
GET http://localhost:3001/api/borrowings/user/2310001

## Borrow
POST http://localhost:3001/api/borrowings
```json
{
  "studentId": "2310001",
  "bookId": "BK001"
}
```
