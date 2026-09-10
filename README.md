# Kashi Walla Book Management

Production-ready, single-tenant inventory and sales tracking application tailored specifically for Kashi Walla Bookstore.

---

## 1. Overview & Business Model

**Kashi Walla Book Management** is designed strictly as an **owner-only** inventory management and sales ledger tool.

- **Access Model**: Direct owner-access workflow — no passwords or login gates to slow down checkout or inventory management.
- **Scope**: Single-tenant inventory control, course bundles, stock transactions, real-time stock deduction, and sales tracking.
- **Out of Scope**: Not a multi-tenant SaaS, not an online payment gateway, and does not require customer accounts.

---

## 2. Core Capabilities

1. **Books Catalog & Stock Control**:
   - Track book details (code, title, author, publisher, price).
   - Server-authoritative stock levels; stock changes are strictly auditable via add-stock and adjustment records.
   - Metadata updates never overwrite stock directly.

2. **Course Bundles**:
   - Group multiple books into courses with required quantities.
   - Real-time calculations of bundle availability based on component book quantities: `MIN(floor(stock / required_quantity))`.

3. **Sales & Stock Deductions**:
   - Record book, course, and mixed multi-item sales.
   - Atomic multi-document Firestore transactions (`db.runTransaction`) prevent race conditions and negative inventory.
   - Support for custom sale pricing with server-side validation.

4. **Inventory Audit Ledger**:
   - Every stock-changing operation creates an immutable `InventoryTransaction` record (Initial Stock, Add Stock, Adjustment, Sale Deduction, Sale Restoration).

5. **Sale Restoration / Cancellation**:
   - Cancelling or deleting a sale safely returns deducted book quantities back into available inventory within an atomic transaction.

6. **Store Settings**:
   - Customize store metadata (store name, phone, address, email) for receipts and overview panels.

---

## 3. Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Recharts.
- **Backend**: Node.js, Express 5, TypeScript (`tsx`).
- **Database (Production)**: Google Cloud Firestore via Firebase Admin SDK.
- **Performance & Reliability**: Direct instant access, atomic multi-document transactions, strict input validation, resilient local/offline fallbacks.
- **Deployment**: Vercel Serverless (`/api/index.ts`) & standalone container environments (`server.ts`).

---

## 4. Environment Variables

Configure the following variables in your production environment (e.g. Vercel dashboard or container runtime):

| Variable | Description | Required in Production |
| :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | Google Cloud / Firebase project ID | Yes |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email | Yes |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key (PEM format) | Yes |
| `FIREBASE_DATABASE_ID` | *(Optional)* Firestore database ID if using non-default | No |
| `CORS_ORIGIN` | *(Optional)* Origin URL if frontend is on a separate host | No |

---

## 5. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Run development server:
   ```bash
   npm run dev
   ```
   The application runs on `http://localhost:3000`.

---

## 6. Production Deployment (Vercel)

1. Connect the repository to Vercel.
2. In the Vercel project settings under **Environment Variables**, add:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
3. Build & Output settings:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. The deployment automatically routes `/api/*` through the serverless function defined in `/api/index.ts` using rules in `vercel.json`.
