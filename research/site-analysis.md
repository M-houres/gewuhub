# SpeedAI Site Analysis

Date: 2026-03-26

Scope: `https://speedai.fun` English site, using Playwright screenshots, logged-in session replay, bundle route extraction, and real request/response capture.

Artifacts:

- Screenshots: `research/screenshots/`
- Public route scan: `research/outputs/route-scan.json`
- Page route extraction: `research/outputs/page-routes.txt`
- API endpoint extraction: `research/outputs/api-endpoints.txt`
- Core flow logs:
  - `research/outputs/flow-rewrite_similarity.json`
  - `research/outputs/flow-reduce_ai.json`
  - `research/outputs/flow-detect.json`
  - `research/outputs/flow-upload-docx.json`
- Downloaded sample result: `research/outputs/sample-academic-result.docx`

Note: raw capture artifacts under `research/outputs/` are kept as local research materials and are ignored by Git because they may contain temporary signed URLs or third-party response payloads.

## 1. Product Summary

`speedai.fun` is not a classic marketing-site-plus-dashboard split product. Its root entry redirects directly into the application workspace at `/en/AI-search`, even for unauthenticated users.

The product positioning is:

- AI writing and rewriting assistant for students and researchers
- AI detection and anti-detection tool
- Research-agent style academic content generator
- Template, literature, and asset management workspace

Important product relationship:

- Frontend domain: `speedai.fun`
- Core API domain observed in live requests: `api.kuaipaper.com`
- File download host observed in live requests: `speedai-docs-1332865721.cos.ap-beijing.myqcloud.com`

Inference: `speedai.fun` and `kuaipaper` are very likely the same codebase / product line with different branding and locale presets.

## 2. Public Pages

Canonical public pages are under `/welcome/*`, not under `/pricing` or `/tutorials`.

Observed public pages:

- `/en/welcome`
- `/en/welcome/about`
- `/en/welcome/contact`
- `/en/welcome/pricing`
- `/en/welcome/tutorials`
- `/en/welcome/privacy`
- `/en/welcome/terms`
- `/en/welcome/disclaimer`
- `/en/welcome/cookie`

Observed behavior:

- `/pricing`, `/tutorials`, `/about`, `/login`, `/register` all redirected to `/en/AI-search` in our direct navigation test.
- `/en/login`, `/en/register`, `/en/signin` also redirected to `/en/AI-search`.
- Login and registration are modal-driven inside the app, not independent pages on `speedai.fun`.

Public page screenshots captured:

- `research/screenshots/welcome.png`
- `research/screenshots/welcome_pricing.png`
- `research/screenshots/welcome_tutorials.png`
- `research/screenshots/welcome_about.png`
- `research/screenshots/welcome_contact.png`

## 3. Visible Feature List

### Main App Left Navigation

Observed from live app UI and route scan:

- Research Agent
- Rewrite & De-AI
- AIGC Detection
- Literature Review
- Proposal Report
- Essay Generation
- Format Adjustment
- AI Editor
- AI PPT
- AI Review
- My Assets

### My Assets Related Routes

Discovered from route scan and page capture:

- `/en/project-assets`
- `/en/project-assets/project-assets`
- `/en/project-assets/literature-management`
- `/en/project-assets/template-management`
- `/en/project-assets/knowledge-base`
- `/en/references`
- `/en/file-library`
- `/en/template-market`
- `/en/my-templates`

### Secondary / Hidden App Routes

Discovered from bundle extraction:

- `/en/turnitin-detection`
- `/en/rewrite/task`
- `/en/ppt/setup/:presentationId`
- `/en/ppt/editor/:presentationId`
- `/en/AI-search/:conversationId`
- `/en/shared/:conversationId`
- `/en/chat`
- `/en/discount`
- `/en/promotion`
- `/en/mobile-tip`
- `/en/home`
- `/en/kaiti`
- `/en/literature-review`
- `/en/thesis`
- `/en/pdf/:literature_id`

## 4. Full Page Route List

Discovered page routes are saved in `research/outputs/page-routes.txt`.

Main route list:

```text
/AI-search
/AI-search/:conversationId
/AI-search?view=none&mode=essay
/AI-search?view=none&mode=kaiti
/AI-search?view=none&mode=survey
/aigc-detection
/chat
/contact
/discount
/file-library
/format
/home
/kaiti
/literature-review
/mobile-tip
/my-templates
/pdf/:literature_id
/ppt
/ppt/editor/:presentationId
/ppt/setup/:presentationId
/project-assets
/project-assets/knowledge-base
/project-assets/literature-management
/project-assets/project-assets
/project-assets/template-management
/promotion
/references
/review
/rewrite
/rewrite/task
/rewrite?mode=aigc
/rewrite?mode=deai
/rewrite?mode=polish
/rewrite?mode=rewrite
/rewrite?mode=rewrite_deai
/rewrite?mode=similarity
/shared/:conversationId
/signin/wechat-binding-callback
/signin/wechat-callback
/template-market
/thesis
/turnitin-detection
/tutorials
/welcome
/welcome#features
/welcome/about
/welcome/contact
/welcome/cookie
/welcome/disclaimer
/welcome/help
/welcome/pricing
/welcome/privacy
/welcome/terms
/welcome/tutorials
/writer
```

## 5. UI Design Spec

### Overall App Layout

Observed app layout on `speedai.fun`:

- Single left sidebar, not dual-sidebar
- Top-right utility bar with invite, points, notifications, language, avatar
- Large central content canvas
- Bottom-left floating points card

Important note:

- The live `speedai.fun` UI is a single-column left rail around 190px wide.
- It does **not** use the `56px icon rail + 160px text rail` dual-sidebar layout from your target spec.
- If we later build “strictly like kuaipaper”, we should verify the domestic site separately before implementation.

### Measured / Observed Styles

From live DOM, screenshots, and computed styles:

- Primary action color: `#6366F1`
- Secondary purple accent / gradient end: `#8836E9`
- Frequent light purple fills: around `#EEF2FF` / `#F5F3FF`
- Card border radius: commonly `8px`
- CTA / control pills: rounded capsule shapes
- Large app content heading:
  - text: `Intelligently create structured academic documents`
  - size observed: `36px`
  - weight observed: `400`
- Feature card size on app home:
  - observed card width: `288px`
  - observed card height: `200px`
- Feature card shadow:
  - approx `0 4px 15px rgba(0,0,0,0.05)`
- Marketing CTA button:
  - background `#6366F1`
  - border radius `8px`
  - white text

Typography note:

- Buttons and controls use system sans / PingFang-like stacks.
- Some large English headings rendered as serif fallback in headless Windows capture.
- This means the exact typeface is partly environment-dependent; the intended visual direction is modern sans UI + more editorial-looking large headings.

### Key Components

Observed recurring components:

- Home shortcut cards for three core functions
- Capsule mode tabs: `Doc / PPT / Sheet / Q&A / Code / Edit`
- Text/file two-tab switchers inside tool pages
- Points chip in top bar and points mini-card at bottom left
- Feature-specific records/history lists
- Legal footer repeated in both marketing and app surfaces

## 6. Authentication and Entry Flow

Observed authentication behavior:

- Unauthenticated users can browse most surfaces.
- Submission or protected tools can trigger login modal.
- Current tested live session was a WeChat-bound user.

Observed login modal:

- `SMS Login`
- `Account Login`
- Invite code field
- WeChat QR login block
- Auto-registration note for new users

Observed account profile response:

- `wechat_bound: true`
- `phone: null`
- `email: null`

Important deviation from your planned product:

- `speedai.fun` does **not** expose email + Google OAuth as its main live auth path.
- Its current live login pattern is phone/username/password + SMS + WeChat QR.

## 7. Core Business Flows

### A. Reduce Repetition Rate

Route:

- `/en/rewrite?mode=similarity`

Observed text flow:

1. Select language
2. Select platform (`CNKI`, `VIP`, `Gezida`, `Daya/Wanfang/Turnitin` depending on language)
3. Switch to paste-text tab
4. Input text
5. Live estimated cost updates
6. Click `Generate`
7. UI enters `Generating rewrite result...`
8. Result appears inline with original text and rewritten text

Observed live API flow:

- submit: `POST /v1/rewrite_async`
- poll: `GET /v1/task_async/result/{task_id}`

Observed submission payload:

```json
{
  "info": "<input text>",
  "lang": "English",
  "username": "<username>",
  "type": "zhiwang"
}
```

Observed submit response:

```json
{
  "task_id": "...",
  "code": 200,
  "message": "任务已提交，请稍后查询结果"
}
```

Observed running poll response:

```json
{
  "task_id": "...",
  "status": "running",
  "rewrite": "",
  "code": 200,
  "message": "正在改写中..."
}
```

Evidence:

- `research/screenshots/flow_rewrite_similarity_filled.png`
- `research/screenshots/flow_rewrite_similarity_processing.png`
- `research/screenshots/flow_rewrite_similarity_completed.png`
- `research/outputs/flow-rewrite_similarity.json`

### B. Reduce AIGC Rate

Route:

- `/en/rewrite?mode=aigc`

Observed text flow:

1. Select language
2. Select platform
3. Switch to paste-text tab
4. Input text
5. Estimated cost updates
6. Click `Generate`
7. UI enters processing state
8. Result appears inline

Observed live API flow:

- submit: `POST /v1/deai_async`
- poll: `GET /v1/task_async/result/{task_id}`

Observed submit payload:

```json
{
  "info": "<input text>",
  "lang": "English",
  "username": "<username>",
  "type": "zhiwang"
}
```

Observed running poll message:

- `正在降AI中...`

Evidence:

- `research/screenshots/flow_reduce_ai_filled.png`
- `research/screenshots/flow_reduce_ai_processing.png`
- `research/screenshots/flow_reduce_ai_completed.png`
- `research/outputs/flow-reduce_ai.json`

### C. AIGC Detection

Route:

- `/en/aigc-detection`

Observed text flow:

1. Switch to `Paragraph Detection`
2. Input text
3. Click `Start Detection`
4. Detection returns quickly
5. Result page shows risk breakdown and word count

Observed live API flow:

- submit/result: `POST /v1/ai_detect_paragraphs`

Observed payload:

```json
{
  "text": "<input text>",
  "username": "<username>",
  "keep_empty": true,
  "detect_type": "zhiwang"
}
```

Observed response shape:

```json
{
  "paragraphs": [
    {
      "index": 0,
      "text": "<paragraph>",
      "ai_rate": 0.5585,
      "ai_rate_percent": "55.85%",
      "risk_level": "低风险"
    }
  ],
  "code": 200,
  "diff": null
}
```

Observed UI result summary:

- High Risk / Medium Risk / Low Risk / No Risk
- Detection time
- Word count

Evidence:

- `research/screenshots/flow_detect_filled.png`
- `research/screenshots/flow_detect_processing.png`
- `research/screenshots/flow_detect_completed.png`
- `research/outputs/flow-detect.json`

### D. File Upload -> Processing -> Download

Route used:

- `/en/rewrite?mode=aigc`

Observed file flow:

1. Upload `.docx`
2. System computes price first
3. User clicks the main file-processing action button
4. Detail page opens with progress, original text, rewritten text
5. After processing reaches 100%, `Download Result` becomes available
6. Download returns a presigned cloud storage URL

Observed live API chain:

- cost estimation: `POST /v1/docx/cost`
- start processing: `POST /v1/docx/start`
- download: `POST /v1/docx/download`

Observed `docx/start` form payload:

```text
doc_id=<doc_id>&FileName=sample-academic.docx&username=<username>&mode=deai&type_=zhiwang&changed_only=true&skip_english=false
```

Observed `docx/download` request body:

```json
{
  "user_doc_id": "<doc_id>",
  "username": "<username>"
}
```

Observed `docx/download` response:

- `status: success`
- `url: <presigned Tencent COS URL>`
- `cos_path: api_user_docs/<doc_id>.docx`
- browser suggested filename: `改后-sample-academic.docx`

Observed cloud/storage conclusion:

- This live site currently uses Tencent COS style signed URLs, not Ali OSS.

Evidence:

- `research/screenshots/flow_upload_ready.png`
- `research/screenshots/flow_upload_submitted.png`
- `research/screenshots/flow_upload_after_60s.png`
- `research/screenshots/flow_upload_downloaded.png`
- `research/outputs/flow-upload-docx.json`
- `research/outputs/sample-academic-result.docx`

### E. Research Agent Document Generation

Observed flow on `/en/AI-search`:

1. Choose mode (`Doc / PPT / Sheet / Q&A / Code / Edit`)
2. Enter topic and requirements
3. Optionally attach local file
4. Optionally select literature
5. Choose template mode:
   - No Template
   - Formatting Template
   - Peer Template
6. Send to start generation

Route variants:

- `mode=survey` for Literature Review
- `mode=kaiti` for Proposal Report
- `mode=essay` for Essay Generation

Observed step wizard on literature/proposal/essay routes:

1. Basic Info
2. Details
3. Modify Outline
4. Literature
5. Generate

## 8. API Inventory

The complete extracted list is in `research/outputs/api-endpoints.txt`.

### Auth / User / Session

- `/v1/login`
- `/v1/register`
- `/v1/register-by-invite`
- `/v1/gettoken`
- `/v1/user/profile`
- `/v1/daily-sign`
- `/v1/daily-sign/status`
- `/v1/checkinvite`
- `/v1/checkemail`
- `/v1/checkvip`
- `/v1/bind-phone`
- `/v1/wechat/login`
- `/v1/wechat/login/qrcode`
- `/v1/wechat/login/status`
- `/v1/wechat/bind_login`
- `/v1/apple/login`

### Points / Billing / Promotion

- `/v1/gettoken`
- `/v1/agent/balance`
- `/v1/agent/ledger`
- `/v1/payment/create`
- `/v1/payment/query`
- `/v1/payment/payment-record`
- `/v1/redeem-code`
- `/v1/promotion/info`
- `/v1/promotion/invites`
- `/v1/promotion/stats`
- `/v1/promotion/withdraw`

### Rewrite / De-AI / Polish

- `/v1/rewrite`
- `/v1/rewrite_async`
- `/v1/rewrite_json`
- `/v1/rewrite_word`
- `/v1/rewrite_word_async`
- `/v1/deai`
- `/v1/deai_async`
- `/v1/deai_json`
- `/v1/deai_word`
- `/v1/deai_word_async`
- `/v1/polish`
- `/v1/polish_async`
- `/v1/polish_json`
- `/v1/polish_word`
- `/v1/polish_word_async`
- `/v1/task_async/result/{task_id}`

### AIGC / Detection

- `/v1/ai_detect_paragraphs`
- `/v1/ai_detect_report`
- `/v1/turnitin/create`
- `/v1/turnitin/status`
- `/v1/turnitin/report`
- `/v1/turnitin/list`

### DOCX / File Processing

- `/v1/docx/cost`
- `/v1/docx/start`
- `/v1/docx/status`
- `/v1/docx/result`
- `/v1/docx/download`
- `/v1/docx/report`
- `/v1/docx/meta`
- `/v1/docx/resume`
- `/v1/docx/paragraph/regenerate`

### Research Agent / Conversations

- `/v1/research/list_sessions`
- `/v1/research/get_history`
- `/v1/research/chat/start_stream`
- `/v1/research/chat/stop_stream`
- `/v1/research/chat/get_diff_events`
- `/v1/research/get_upload_url`
- `/v1/research/get_download_url`
- `/v1/research/get_preview_url`
- `/v1/research/process_resource`

### Assets / Literature / Templates

- `/v1/file_libraries/*`
- `/v1/literatures/*`
- `/v1/template_market/*`
- `/v1/folders/*`
- `/v1/zotero/*`

## 9. Points System

Observed current point model:

- `General points`
- `Agent points`

Observed live point query:

```json
{
  "code": 200,
  "token": 15738,
  "agent_token": 82000
}
```

Observed UI:

- top bar displays total remaining points
- detail breakdown displays `General + Agent`
- app note explicitly says agent points are not available for rewrite/polish

Inference:

- Standard rewrite / de-AI / detection consume `General points`
- Research-agent generation likely consumes `Agent points` or mixed cost rules

Observed point / reward rules from live copy:

- New users get `500` free points on registration
- Invite rewards: both parties get `2000` points
- Pricing page says points are permanently valid
- AIGC detection page says `Five free accesses per day`
- AIGC detection page says `2000 general points per 10,000 characters`

Observed real cost examples during our run:

- Rewrite text example: estimated `484` general points
- Reduce-AI text example: estimated `405` general points
- DOCX reduce-AI sample: estimated `422` points

## 10. Pricing Structure

Observed on `/en/welcome/pricing`:

### Starter

- Display price: `¥19.99`
- Strikethrough reference: `¥30`
- `10000 points`
- `Approx. ¥2 per 1,000 characters`

### Professional

- Display price: `¥79.99`
- Strikethrough reference: `¥150`
- `50000 points`
- `Approx. ¥1.6 per 1,000 characters`

### Premium

- Display price: `¥418`
- Strikethrough reference: `¥900`
- `300000 points`
- `Approx. ¥1.4 per 1,000 characters`

Included marketing promises on pricing page:

- plagiarism and AI reduction support
- unlimited automatic literature search and management
- permanent point validity

## 11. Important Build Implications

### What To Copy Faithfully

- Single-entry app feel: users land inside product, not a detached marketing homepage
- Left-nav workspace with quick function switching
- Top bar points / recharge / notification system
- Rewrite and de-AI as separate modes of the same underlying tool
- History-heavy UX: records are always nearby
- Template and literature assets integrated directly into generation flow

### What Not To Assume

- Do not assume separate login/register pages exist
- Do not assume email/Google auth is already core to the benchmark
- Do not assume Ali OSS: live product currently shows Tencent COS
- Do not assume visible dual-sidebar on `speedai.fun`

### Architecture Clues From Research

- SPA frontend with Vite-style bundled assets
- backend API appears generated / strongly typed
- async text jobs use task IDs + polling
- docx jobs use dedicated document-processing endpoints
- product already supports literature, templates, assets, PPT, review, and research chat in one workspace

## 12. Conclusion

`speedai.fun` is best understood as a logged-in-first academic AI workspace, with a thin marketing shell under `/welcome/*`. Its strongest product patterns are:

- fast entry into the app
- points-driven monetization
- unified rewrite/de-AI tool surface
- async text jobs
- document-processing workflow with downloadable results
- integrated literature/template/assets ecosystem

If we use this as the implementation benchmark, the safest next step is:

1. Treat the left-nav workspace as the primary product.
2. Rebuild rewrite / de-AI / detection first, because they expose the clearest API and UX pattern.
3. Recreate points, history, and upload/download flows early, because they are central to the product.
4. Confirm whether you want to follow the actual `speedai.fun` single-sidebar layout, or the dual-sidebar layout you described from the domestic product direction.
