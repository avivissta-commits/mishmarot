# ShiftApp

אפליקציית ניהול משמרות (React + Vite), RTL, עם שמירת נתונים מול Cloudflare Worker API.

## הרצה מקומית

```bash
npm install
npm run dev
```

הפקודה מריצה שרת פיתוח (ברירת מחדל: http://localhost:5173).

## בנייה

```bash
npm run build
```

נוצרת תיקיית `dist/` מוכנה להעלאה לכל אחסון סטטי (כולל GitHub Pages).
`npm run preview` יריץ תצוגה מקומית של תוצר ה-build.

## פריסה ל-GitHub Pages

GitHub Pages מגיש אתר פרויקט בכתובת `https://<user>.github.io/<repo>/`, ולכן
צריך שה-`base` יכלול את שם ה-repo.

### אפשרות א׳ — אוטומטי (מומלץ)

הפרויקט כולל workflow ב-`.github/workflows/deploy.yml`:

1. צור repo ב-GitHub ודחוף אליו את הקוד (branch `main`).
2. ב-**Settings → Pages → Build and deployment → Source** בחר **GitHub Actions**.
3. כל דחיפה ל-`main` תבנה ותפרוס אוטומטית. ה-workflow מגדיר את `VITE_BASE`
   לשם ה-repo לבד, כך שהנכסים נטענים מהנתיב הנכון.

### אפשרות ב׳ — ידני עם `gh-pages`

```bash
VITE_BASE=/<repo>/ npm run build
npx gh-pages -d dist
```

(או `npm run deploy` אחרי שמגדירים `VITE_BASE`.)

> אם מדובר ב-user/organization page (`https://<user>.github.io/`) או דומיין מותאם,
> השאר את `VITE_BASE` כ-`/`.

הערה: קיים `dist/404.html` (עותק של `index.html`) לתמיכה בניווט SPA, וקובץ
`public/.nojekyll` כדי ש-Pages יגיש נכסים בנתיבים עם `_`.

## חיבור ל-API (Cloudflare Worker)

הנתונים נשמרים מול Cloudflare Worker (הקוד ב-`worker/`).

1. פרוס את ה-Worker:
   ```bash
   cd worker
   wrangler kv namespace create SHIFT_KV      # הדבק את ה-id ל-wrangler.toml
   wrangler deploy
   ```
2. חבר את ה-Frontend לכתובת ה-Worker באחת מהדרכים:
   - build-time: הגדר `VITE_API_URL` (ראה `.env.example`), או
   - runtime: הסר את ההערה מ-`window.__SHIFT_API_URL__` ב-`index.html`.

אם ה-API לא זמין, האפליקציה נופלת חזרה לנתוני ברירת מחדל מקומיים כדי שה-UI עדיין יעבוד.

## מבנה

```
.
├── index.html
├── vite.config.js
├── package.json
├── public/
│   ├── favicon.svg
│   └── .nojekyll
├── src/
│   ├── main.jsx        # נקודת כניסה
│   ├── ShiftApp.jsx    # האפליקציה
│   ├── api.js          # שכבת ה-API (fetch ל-Worker)
│   └── index.css
├── worker/
│   ├── worker.js       # Cloudflare Worker (REST API + KV)
│   └── wrangler.toml
└── .github/workflows/deploy.yml
```
