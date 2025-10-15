# Aurora Nexus Skyhaven – Mobile Compatibility Audit

## Approach
- Reviewed every EJS view under `views/` along with shared partials to catalogue all unique page types (marketing, booking, amenities, dining, chat, dashboard, authentication, payments, invoices, admin, employee, error handling). 【F:views/home.ejs†L1-L150】【F:views/rooms.ejs†L1-L129】【F:views/booking/wizard.ejs†L1-L129】【F:views/chat/index.ejs†L1-L82】【F:views/dashboard/index.ejs†L1-L152】【F:views/auth/login.ejs†L1-L34】【F:views/payments/pay.ejs†L1-L52】【F:views/amenities/index.ejs†L1-L36】【F:views/amenities/detail.ejs†L1-L36】【F:views/dining/menu.ejs†L1-L87】
- Audited responsive behaviour by tracing each component's layout rules in `public/css` (notably `styles.css`, `dining.css`, `dining-reserve.css`, `admin-console.css`, and `employee-portal.css`) with emphasis on breakpoints, flex/grid fallbacks, and touch affordances. 【F:public/css/styles.css†L320-L380】【F:public/css/styles.css†L2620-L2720】【F:public/css/styles.css†L3290-L3330】【F:public/css/styles.css†L4138-L4166】【F:public/css/dining.css†L1-L120】【F:public/css/dining-reserve.css†L5-L188】【F:public/css/admin-console.css†L1-L120】
- Validated authenticated and admin flows through template inspection using the seeded roles documented in `README.md` (global & super admins plus legacy staff) to ensure coverage of dashboards, dining, chat, and control surfaces. 【F:README.md†L32-L58】

## Global components
| Component | Mobile status | Notes |
| --- | --- | --- |
| Navigation header & drawer | ✅ | Mobile breakpoint at 900 px swaps to slide-in drawer with accessible toggle. Verify focus trap and ESC handling remain active in `public/js/main.js`. 【F:public/css/styles.css†L2506-L2628】【F:public/js/main.js†L9-L61】 |
| Alert & toast stack | ✅ | Stack repositions to 6 rem top offset and full-width cards at ≤720 px to avoid overlap with header. 【F:public/css/styles.css†L2239-L2258】【F:public/css/styles.css†L2624-L2639】【F:public/css/styles.css†L4153-L4165】 |
| Shared grids (`card-grid`, `team-grid`, `dashboard-grid`) | ✅ | Use `auto-fit/auto-fill` with 260–320 px min widths, maintaining single-column flow on 320 px devices. 【F:public/css/styles.css†L563-L739】 |
| Hover-reveal cards (`data-hover-expand`) | ⚠️ Needs follow-up | Extra content only appears on `:hover`/`:focus-within`, leaving no explicit tap control for touch users despite `tabindex="0"`. Recommend adding a toggle button or always expanding on small screens. 【F:views/home.ejs†L48-L116】【F:public/css/styles.css†L569-L604】 |

## Marketing pages
| Page | Status | Findings |
| --- | --- | --- |
| Home (`/`) | ⚠️ Needs follow-up | Carousel padding remains 2.4 rem per side even at ≤960 px, leaving ~220 px of readable width on 320 px devices and risking text wrapping behind the viewport chrome. Consider reducing side padding at ≤480 px. Featured cards reuse the hover-only expansions noted above. 【F:public/css/styles.css†L2660-L2715】【F:public/css/styles.css†L4138-L4151】 |
| Rooms (`/rooms`) | ✅ | `room-card.detailed` collapses to a single column at ≤960 px while metadata grids auto-wrap, keeping pricing legible. Interactive comparison table sits in an `overflow-x:auto` wrapper for horizontal scroll. 【F:public/css/styles.css†L2801-L2834】【F:public/css/styles.css†L3036-L3080】 |
| Amenities index/detail (`/amenities`) | ⚠️ Needs follow-up | List layout uses responsive grids, but detail page lacks dedicated CSS for `.amenity-hero`, `.amenity-detail`, and `.detail-meta`, leaving default block styling that feels unbranded and cramped on phones. Introduce mobile-first spacing and typographic rules. 【F:views/amenities/detail.ejs†L1-L32】 |
| About & Leadership | ⚠️ Needs follow-up | Team cards inherit the hover-only expansion pattern; consider mobile-friendly disclosure controls. Sections otherwise stack cleanly thanks to responsive `team-grid`. 【F:views/leadership.ejs†L15-L86】【F:public/css/styles.css†L703-L739】 |
| Contact | ✅ | Form and contact panel share the grid responsive rules with single-column collapse; labels maintain touch-friendly spacing. 【F:views/contact.ejs†L8-L75】【F:public/css/styles.css†L703-L895】 |
| Error pages (404/500/429) | ✅ | Minimal stacked layouts with centered text scale with inherited typography. 【F:views/404.ejs†L1-L16】【F:public/css/styles.css†L2520-L2550】 |

## Booking & payments
| Flow | Status | Findings |
| --- | --- | --- |
| Booking wizard (`/book`) | ✅ | Stepper pills wrap and the field rows flex-wrap to single inputs per line on narrow screens; review grid uses responsive minmax columns. 【F:views/booking/wizard.ejs†L10-L108】【F:public/css/styles.css†L3296-L3378】 |
| Payment (`/pay/:id`) | ✅ | Two-column summary collapses to stack at ≤960 px; form controls retain ≥44 px height. 【F:views/payments/pay.ejs†L5-L49】【F:public/css/styles.css†L4138-L4146】 |
| Invoice (`/invoices/:id`) | ⚠️ Needs follow-up | Printable invoice relies on wide `table` markup without `overflow` containment, causing horizontal scrolling on phones. Wrap invoice tables in a responsive container similar to `table-wrapper.interactive`. 【F:views/payments/invoice.ejs†L37-L120】 |

## Amenities & dining
| Area | Status | Findings |
| --- | --- | --- |
| Amenity reservation form | ✅ | `field-row` flex-wrap ensures date/time/duration inputs stack on small screens. 【F:views/amenities/detail.ejs†L21-L34】【F:public/css/styles.css†L432-L447】 |
| Dining marketing/menu | ✅ | `dining.css` applies fluid padding and `auto-fit` grids; filter panel stays scrollable with 44 px touch targets. 【F:views/dining/menu.ejs†L7-L87】【F:public/css/dining.css†L24-L152】 |
| Dining reservation webapp | ✅ | Dedicated stylesheet adds mobile-specific stepper shell and animations with ≤640 px overrides; cards remain within 94 vw. 【F:public/css/dining-reserve.css†L5-L188】 |

## Authenticated experiences
| Page | Status | Findings |
| --- | --- | --- |
| Login/Signup | ✅ | Social button grid uses `auto-fit` 140 px min width to avoid overflow, and form spacing is touch-friendly. 【F:views/auth/login.ejs†L6-L31】【F:public/css/styles.css†L910-L940】 |
| Dashboard | ✅ | Panels flow into single column via `auto-fit` 320 px min widths; action chips stay readable. 【F:views/dashboard/index.ejs†L1-L152】【F:public/css/styles.css†L708-L737】【F:public/css/styles.css†L1119-L1151】 |
| Chat | ⚠️ Needs follow-up | Layout drops to single column at ≤960 px, but sidebar remains always-visible above the message log with no toggle, forcing long vertical scrolling before reaching conversations. Introduce an off-canvas toggle or collapse behaviour for the room list on phones. 【F:views/chat/index.ejs†L5-L82】【F:public/css/styles.css†L3468-L3498】【F:public/css/styles.css†L4138-L4144】 |
| Dining account & admin | ✅ | Share responsive grid patterns from `dining.css`, with cards and forms that stack below 600 px. 【F:views/dining/account.ejs†L1-L112】【F:public/css/dining.css†L180-L260】 |
| Admin console | ⚠️ Needs follow-up | Most panels are responsive, yet certain filter toolbars (e.g. `.requests-filters`) keep horizontal flex with 150 px min-width selects that overflow on very small phones. Add wrap behaviour and vertical stacking at ≤480 px. 【F:public/css/styles.css†L4583-L4600】 |
| Employee portal | ✅ | Secondary stylesheet introduces ≤768 px column collapse for schedules and cards. 【F:public/css/employee-portal.css†L1-L160】 |

## Action plan
1. Introduce explicit tap targets for hover-reveal cards (e.g. accordion toggles) or auto-expand them beneath 768 px to surface hidden context on touch devices. 【F:views/home.ejs†L48-L116】【F:public/css/styles.css†L569-L604】
2. Add narrower padding and line-length controls for the homepage hero at ≤480 px to prevent edge-to-edge typography crowding. 【F:public/css/styles.css†L2660-L2715】【F:public/css/styles.css†L4138-L4151】
3. Style amenity detail components with mobile-first spacing and typography to align with the rest of the brand system. 【F:views/amenities/detail.ejs†L1-L32】
4. Wrap invoice tables in a responsive container with horizontal scroll affordances akin to `.table-wrapper.interactive`. 【F:views/payments/invoice.ejs†L37-L120】【F:public/css/styles.css†L3036-L3080】
5. Provide a collapsible chat sidebar or floating room switcher so that message history appears immediately on phone-sized viewports. 【F:views/chat/index.ejs†L5-L82】【F:public/css/styles.css†L3468-L3498】
6. Allow admin filter toolbars to wrap/stack under 480 px to prevent overflow and maintain tapable selects. 【F:public/css/styles.css†L4583-L4599】

