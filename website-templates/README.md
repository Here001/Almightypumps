# Almighty Pumps WordPress templates

WordPress block themes sold in the Almighty Pumps shop. Each theme is defined in `themes/<name>.mjs`
(colours, fonts, illustrations, section patterns); `lib/` holds the shared parts (block markup helpers,
theme.json / templates / functions.php generator, preview renderer).

    node build.mjs --shots        # all themes → dist/<slug>.zip (+ screenshot.png, previews, shop pictures)
    node build.mjs ap-ignite      # one theme

Output (git-ignored): `dist/<slug>.zip` (upload in WordPress: Appearance › Themes › Add New › Upload),
`dist/<slug>-preview/index.html`, `dist/<slug>-full.png`, `dist/<slug>-phone.png`.

Rules: original designs only (no copies of paid themes or brands), fonts under the SIL OFL (licences in `fonts/`),
no stock photos (illustrations are our own SVGs), placeholder testimonials say to use real quotes, themes are GPLv2+.
Block markup must match what the WordPress editor saves (see `lib/blocks.mjs`), or blocks show "unexpected content".
