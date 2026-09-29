# REST API

Base URL: `/api`

## Public

- `GET /health`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/refresh`

## Authenticated

- `GET /auth/me`
- `POST /auth/logout`
- `PUT /auth/password`
- `GET /dashboard`
- `GET|POST /products`
- `GET|PUT|DELETE /products/:id`
- `POST /stock/in`
- `POST /stock/out`
- `GET /stock/invoices/purchases`
- `GET /stock/invoices/sales`
- `GET|POST /debtors`
- `GET|PUT|DELETE /debtors/:id`
- `POST /debtors/:id/payments`
- `GET|POST /representatives`
- `PUT|DELETE /representatives/:id`
- `POST /representatives/:id/deliveries`
- `GET /reports`
- `GET /notifications`
- `PATCH /notifications/read-all`
- `PATCH /notifications/:id/read`
- `DELETE /notifications/:id`
- `GET /settings`
- `PUT /settings/company`
- `PUT /settings/profile`
- `GET /settings/backup`
- `POST /settings/restore`
- `POST /uploads/product`
