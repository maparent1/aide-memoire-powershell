/**
 * Aide-mémoire PowerShell
 * Charge data/commandes.json, puis affiche les commandes avec
 * une recherche instantanée, des filtres par module et un bouton de copie.
 */

const DATA_URL = "data/commandes.json";

const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

const ICON_DONE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 6 9 17l-5-5"/></svg>';

const ui = {
  search: document.getElementById("search"),
  chips: document.getElementById("chips"),
  list: document.getElementById("list"),
};

const state = {
  modules: [],      // ordre d'affichage des modules
  commandes: [],    // commandes visibles par les étudiants
  activeModule: "", // "" = tous les modules
};

/* ==========================================================================
   Utilitaires
   ========================================================================== */

/** Minuscules et sans accents : « Événement » trouve « evenement ». */
function normalize(text) {
  return (text ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Crée un élément avec une classe et un texte (le texte n'est jamais interprété comme du HTML). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Message temporaire en bas de l'écran. */
let toastTimer;
function toast(message) {
  let box = document.querySelector(".toast");
  if (!box) {
    box = el("div", "toast");
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
}

/** Met en évidence la partie du texte qui correspond à la recherche. */
function highlight(node, text, query) {
  const index = query ? normalize(text).indexOf(query) : -1;
  if (index < 0) {
    node.textContent = text;
  } else {
    node.append(
      text.slice(0, index),
      el("mark", null, text.slice(index, index + query.length)),
      text.slice(index + query.length),
    );
  }
  return node;
}

/* ==========================================================================
   Copie
   ========================================================================== */

async function copy(text, button, codeNode) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Repli : sélectionner le texte pour un Ctrl+C manuel.
    const range = document.createRange();
    range.selectNodeContents(codeNode);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    toast("Texte sélectionné : faites Ctrl+C pour copier");
    return;
  }
  button.innerHTML = ICON_DONE;
  button.classList.add("copy--done");
  setTimeout(() => {
    button.innerHTML = ICON_COPY;
    button.classList.remove("copy--done");
  }, 1400);
}

/* ==========================================================================
   Affichage
   ========================================================================== */

function renderExample(line, query) {
  const row = el("div", "example");
  const code = highlight(el("code"), line, query);

  const button = el("button", "copy");
  button.type = "button";
  button.innerHTML = ICON_COPY;
  button.title = "Copier";
  button.setAttribute("aria-label", `Copier : ${line}`);
  button.addEventListener("click", () => copy(line, button, code));

  row.append(code, button);
  return row;
}

function renderCommand(cmd, query) {
  const row = el("div", "row");
  const examples = el("div", "examples");
  for (const line of cmd.exemples) examples.append(renderExample(line, query));

  row.append(
    highlight(el("div", "cmd"), cmd.commande, query),
    highlight(el("div", "desc"), cmd.description, query),
    examples,
  );
  return row;
}

function renderModule(name, commandes, query) {
  const section = el("section", "module");
  section.append(el("h2", "module__title", name));

  const table = el("div", "table");
  const head = el("div", "row row--head");
  head.append(el("div", null, "Commande"), el("div", null, "À quoi ça sert"), el("div", null, "Exemple"));
  table.append(head);

  let lastCategory = null;
  for (const cmd of commandes) {
    if (cmd.categorie && cmd.categorie !== lastCategory) {
      table.append(el("div", "category", cmd.categorie));
      lastCategory = cmd.categorie;
    }
    table.append(renderCommand(cmd, query));
  }

  section.append(table);
  return section;
}

function renderChips(counts) {
  ui.chips.textContent = "";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const addChip = (label, value, count) => {
    const chip = el("button", "chip", label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(state.activeModule === value));
    chip.append(el("span", "chip__count", String(count)));
    chip.addEventListener("click", () => {
      state.activeModule = state.activeModule === value ? "" : value;
      render();
    });
    ui.chips.append(chip);
  };

  addChip("Tous", "", total);
  for (const name of state.modules) if (counts[name]) addChip(name, name, counts[name]);
}

function matches(cmd, query) {
  if (!query) return true;
  return [cmd.commande, cmd.description, cmd.categorie, cmd.module, ...cmd.exemples]
    .some((text) => normalize(text).includes(query));
}

function render() {
  const query = normalize(ui.search.value.trim());
  const found = state.commandes.filter((cmd) => matches(cmd, query));

  const counts = {};
  for (const cmd of found) counts[cmd.module] = (counts[cmd.module] ?? 0) + 1;
  if (state.activeModule && !counts[state.activeModule]) state.activeModule = "";
  renderChips(counts);

  ui.list.textContent = "";
  if (!found.length) {
    const message = state.commandes.length
      ? `Aucune commande ne correspond à « ${ui.search.value.trim()} ».`
      : "Aucune commande pour l'instant.";
    ui.list.append(el("p", "empty", message));
    return;
  }

  for (const name of state.modules) {
    if (state.activeModule && name !== state.activeModule) continue;
    const commandes = found.filter((cmd) => cmd.module === name);
    if (commandes.length) ui.list.append(renderModule(name, commandes, query));
  }
}

/* ==========================================================================
   Chargement des données
   ========================================================================== */

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`le fichier ${DATA_URL} est introuvable (HTTP ${response.status}).`);

  let data;
  try {
    data = JSON.parse(await response.text());
  } catch (error) {
    throw new Error(`erreur de syntaxe dans ${DATA_URL} : ${error.message}`);
  }

  const commandes = (data.commandes ?? [])
    .filter((cmd) => !cmd.aValider)
    .map((cmd) => ({
      module: cmd.module ?? "Sans module",
      categorie: cmd.categorie ?? "",
      commande: cmd.commande ?? "",
      description: cmd.description ?? "",
      exemples: Array.isArray(cmd.exemples) ? cmd.exemples : [],
    }));

  // Ordre des modules : celui de « modules », puis ceux qui n'y figurent pas.
  const modules = [...(data.modules ?? [])];
  for (const cmd of commandes) if (!modules.includes(cmd.module)) modules.push(cmd.module);

  return { modules, commandes };
}

function showError(error) {
  ui.list.textContent = "";
  const box = el("p", "empty");
  if (location.protocol === "file:") {
    box.textContent = "Ouvrez cette page depuis GitHub Pages ou un serveur local (voir le README) : "
      + "le navigateur bloque la lecture des données quand on ouvre le fichier par double-clic.";
  } else {
    box.append("Impossible d'afficher les commandes : ", el("code", null, error.message));
  }
  ui.list.append(box);
}

/* ==========================================================================
   Démarrage
   ========================================================================== */

ui.search.addEventListener("input", render);

// Touche « / » : aller à la recherche.
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== ui.search) {
    event.preventDefault();
    ui.search.focus();
  }
});

try {
  Object.assign(state, await loadData());
  render();
} catch (error) {
  showError(error);
}
