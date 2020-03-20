import { html } from 'lit-html'

/**
 * Based on https://www.smashingmagazine.com/2016/12/styling-web-components-using-a-shared-style-sheet/
 * this seems like the currently only sensible approach to have some shared styles in web components?
 *
 * Maybe having a <link> tag to an external extra stylesheet? But that seems like mixing global knowledge
 * with local knowledge?
 */
export const sharedCommonStyles = html`
  <style>
    input {
      /* By default input fields do not inherit font features */
      font-size: inherit;
      font-family: inherit;
      height: 2em;
    }

    input[type="checkbox"] {
      height: 2em;
      padding: 0;
      margin: 0;
    }

    button,
    input[type=file] {
      font-weight: bold;
      padding: 6px 12px 6px 12px;
      border: none;
      background-color: #e0e1e2;
      color: rgba(0,0,0,.8);
      border-radius: 3px;
      height: 2em;
    }

    button:disabled,
    button.primary:disabled,
    input[type=file]:disabled {
      background-color: #e0e1e2;
      color: rgba(0,0,0,.4);
    }

    button.primary {
      background-color: #2185d0;
      color: rgba(255, 255, 255, 0.9);
    }
  </style>`
