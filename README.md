# Ziwei Song — academic homepage

Personal academic website, hosted with GitHub Pages at
<https://ziweisong96.github.io>.

Built on [academic-homepage](https://github.com/luost26/academic-homepage) (Jekyll +
Bootstrap 4) with a custom dark technical theme.

## Structure

| Path | What it is |
| --- | --- |
| `_data/profile.yml` | Name, positions, email, social links, bio, education, experience, awards |
| `_data/navigation.yml` | Top navigation items |
| `_data/display.yml` | Which homepage widgets to show + footer text |
| `_publications/` | One Markdown file per publication |
| `_news/` | One Markdown file per news item |
| `_includes/widgets/` | Homepage cards (profile, bio, experience, news, publications, beyond research) |
| `_layouts/default.html` | Page shell, fonts, meta tags, scripts |
| `assets/css/global.css` | Base layout and theme variables |
| `assets/css/steampunk.css` | Brass-and-parchment theme overrides |
| `assets/js/site.js` | Scroll progress, card reveal, portrait shrink |
| `assets/images/` | Portrait, favicon, social share card |

## Interactive lab — Deadline Express

The homepage includes an interactive steampunk railway scene: a brass locomotive
at a station, connected to an MoE engine under a memory budget and a control deadline.

| File | Purpose |
| --- | --- |
| `_includes/widgets/deadline_drive.html` | Markup and controls |
| `assets/css/deadline-drive.css` | Lab card styling |
| `assets/js/deadline-drive.js` | Simulation, railway canvas, expert gauges, latency chart |

It is loaded only on pages with `show_deadline_drive: true` in the front matter
(currently `index.html`). Tune the scenario weights, load cost and defaults in the
`INSTRUCTIONS` / `state` objects at the top of the JS file. The simulation is
illustrative, not a benchmark.

The locomotive, MoE engine cabinet and latency chart are paper hotspots: hover or tap
them (and the `Earlier work` chips) to open the publication card. Paper metadata lives in
the `PAPERS` object in `assets/js/deadline-drive.js`.

## Publications

Publication cards use first-page thumbnails generated from the authors' PDFs.
The PDFs themselves are not hosted on this site; cards link to DOI landing pages
instead of direct PDF downloads.

## Editing content

- **Profile / bio / education / awards**: `_data/profile.yml`
- **Add a publication**: copy a file in `_publications/` and edit the front matter
  (`title`, `date`, `selected`, `pub`, `venue_short`, `abstract`, `authors`, `links`).
- **Add news**: copy a file in `_news/`.
- **Navigation**: `_data/navigation.yml` (the `name` must match the page's
  `navbar_title`).
- **Colours / typography**: the CSS custom properties at the top of
  `assets/css/global.css`.

## Local preview

The site is plain Jekyll 3.9 and also builds in GitHub Pages' native builder.

```bash
# One-time setup (Ruby 3.1 via conda; system Ruby may work too)
conda create -n jekyll -c conda-forge ruby=3.1 gcc_linux-64 gxx_linux-64 make
conda activate jekyll
gem install bundler

# Preview
bundle install
bundle exec jekyll serve
# → http://127.0.0.1:4000
```

On this machine the environment already exists; run:

```bash
conda run -n jekyll bundle exec jekyll serve
```

## Deployment

Push to `master`. GitHub Pages builds the site automatically; no Actions workflow
or generated `_site/` directory is committed.

## Things still to fill in

- Google Scholar ID (`gscholar` in `_data/profile.yml`) and any LinkedIn / ORCID.
- DOI or PDF links for the three publications (`links:` in `_publications/`).
- A current CV PDF (the CV page currently says "available on request").
- Optional: university logos in `assets/images/badges/` if you want them next to
  Education entries.
