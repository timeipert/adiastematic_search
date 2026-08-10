import anywidget
import traitlets


# The CSS part of the widget defines a new font-family "Volpiano"
# and applies it to the container div.
CSS = f"""
@font-face {{
  font-family: 'Volpiano';
  src: url('./volpiano/volpiano.woff') format('woff');
  font-weight: normal;
  font-style: normal;
}}

.volpiano-container {{
  font-family: 'Volpiano', monospace;
  font-size: 2rem;
  padding: 0.5rem;
}}
"""


# The JavaScript part handles rendering the component.
# Note the single braces for valid JavaScript syntax.
ESM = """
function render({ model, el }) {
  const container = document.createElement("div");
  container.classList.add("volpiano-container");

  const updateText = () => {
    container.textContent = model.get("text");
  };

  updateText();
  model.on("change:text", updateText);

  el.appendChild(container);
}

export default { render };
"""

class VolpianoWidget(anywidget.AnyWidget):
    """
    An anywidget component to display text using the Volpiano font.
    """
    _esm = ESM
    _css = CSS
    text = traitlets.Unicode("").tag(sync=True)

