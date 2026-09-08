# Glass CSS provenance

Vendored from https://github.com/abheet19/glass at commit ba68435921993f0cb1a3a7fec0cc841ac6f86c01 (MIT).

- tokens.css ← src/tokens.css
- primitives.css ← src/primitives.css
- textify.css ← src/themes/textify.css

These files are served locally so a mutable CDN release or outage cannot change the workspace UI. When updating them, copy those three files from a reviewed Glass revision, preserve its LICENSE, update this reference, and rerun Textify's browser checks. Application CSS remains in app/web/app.css.
