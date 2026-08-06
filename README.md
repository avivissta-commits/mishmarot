# ShiftApp

אפליקציית ניהול משמרות בעברית (React + Vite), עם שמירת נתונים מול Cloudflare Worker ו-KV.

## הרצה מקומית

```bash
npm install
npm run dev
```

Vite יריץ את האתר בדרך כלל ב-`http://localhost:5173`.
לא לפתוח את `index.html` ישירות מה-Finder, כי קבצי React/JSX צריכים לעבור דרך Vite או דרך build.

## בנייה

```bash
npm run build
npm run preview
```

תוצר ההעלאה נמצא בתיקיית `dist/`.

## פריסה ל-GitHub Pages

הפרויקט כולל workflow מוכן ב-`.github/workflows/deploy.yml`.

1. צרו repo ב-GitHub ודחפו אליו את הפרויקט ל-branch בשם `main`.
2. ב-GitHub פתחו `Settings -> Pages`.
3. תחת `Build and deployment`, בחרו `Source: GitHub Actions`.
4. כל push ל-`main` יבנה ויפרסם את האתר.

ה-workflow מגדיר אוטומטית:

```bash
VITE_BASE=/<repo-name>/
```

כדי לחבר את האתר ל-Worker בפריסה האוטומטית, הוסיפו ב-GitHub:
`Settings -> Secrets and variables -> Actions -> Variables -> New repository variable`

שם:

```bash
VITE_API_URL
```

ערך:

```bash
https://shiftapp-api.<your-subdomain>.workers.dev
```

## פריסת Cloudflare Worker

ה-Worker נמצא ב-`worker.js` והתצורה ב-`wrangler.toml`.

1. התחברו ל-Cloudflare:

```bash
npx wrangler login
```

2. צרו KV namespace:

```bash
npx wrangler kv namespace create SHIFT_KV
```

3. העתיקו את ה-`id` שמתקבל לתוך `wrangler.toml` במקום:

```toml
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
```

4. פרסו את ה-Worker:

```bash
npx wrangler deploy
```

או דרך הסקריפט:

```bash
npm run worker:deploy
```

5. העתיקו את כתובת ה-Worker שהתקבלה אל `VITE_API_URL` ב-GitHub Actions variable.

## מבנה הפרויקט

```text
.
├── .github/workflows/deploy.yml
├── public/.nojekyll
├── index.html
├── main.jsx
├── ShiftApp.jsx
├── api.js
├── index.css
├── worker.js
├── wrangler.toml
├── package.json
└── vite.config.js
```

## נתונים לפי משתמש

האפליקציה מייצרת מזהה משתמש אנונימי בדפדפן ושולחת אותו ל-Worker דרך `X-User-Id`.
ה-Worker שומר לכל משתמש מסמך נפרד ב-Cloudflare KV תחת מפתח `user:<id>`.


Update README
