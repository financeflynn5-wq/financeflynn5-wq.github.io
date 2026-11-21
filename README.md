# Flynn's Games

The website where people find and play Flynn's games. It's plain HTML, CSS and JavaScript with no build step, hosted free on GitHub Pages.

## Add or change a game

Everything is in **`js/games.js`**:

1. Copy one of the game blocks and change the text.
2. When it's playable, set `status: "playable"` and put the web build's link in `play`.
3. Optional: put a screenshot in `img/` and set `image: "img/yourgame.jpg"`.
4. Put your YouTube, Twitch, itch.io and Discord links in `SITE.links` at the top. Empty ones are hidden.

Then commit and push. GitHub Pages updates in about a minute.

## Where the games live

- **Already on GitHub Pages:** FTA 6, Steelbind and Flynnland each publish from their own public repo.
- **On itch.io:** upload a web build with butler (`C:\Dev\tools\butler\butler.exe`):

  ```
  C:\Dev\tools\butler\butler.exe push path\to\web-build yourname/game-slug:html5
  ```

  On the itch game page, set Kind of project to **HTML** and tick **This file will be played in the browser**. Then put the itch link in `games.js`: use `play` for the build's link and `itch` for the page.

## Preview locally

```
npx serve .
```
