This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Valuation request contract

`POST /api/valuate` currently returns a fixed **test valuation** after validating
the request. It does not invoke Gemini or retrieve marketplace listings.

Send JSON with `imageBase64` and a required `mimeType` (`image/jpeg`, `image/png`,
or `image/webp`). Use standard Base64 with padding and no whitespace, or a data
URL whose MIME type matches `mimeType`. The decoded payload limit is 8 MiB.
Validation checks Base64 encoding, not image decodability or file signatures.

Android callers must add `val mimeType: String` to `ImageRequest` and pass the
actual encoded image's MIME type. When using Android's Base64 encoder, select
`Base64.NO_WRAP` (keep padding enabled).

Errors have the shape `{ "error": "Invalid image", "code": "INVALID_IMAGE" }`:

| Code | HTTP status |
| --- | --- |
| INVALID_REQUEST | 400 |
| INVALID_IMAGE | 400 |
| INVALID_MIME_TYPE | 400 |
| IMAGE_TOO_LARGE | 413 |
| VALUATION_FAILED | 502 |

Authentication, rate limiting, and engine integration are subsequent steps.
Run `npm test` to check validation, route responses, and deterministic engine modules.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
