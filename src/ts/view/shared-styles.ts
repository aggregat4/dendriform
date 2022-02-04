import { html } from 'lit-html'

/**
 * Based on https://www.smashingmagazine.com/2016/12/styling-web-components-using-a-shared-style-sheet/
 * this seems like the currently only sensible approach to have some shared styles in web components?
 *
 * Maybe having a <link> tag to an external extra stylesheet? But that seems like mixing global knowledge
 * with local knowledge?
 */
export const sharedCommonStyles = html`<style>
  input,
  button {
    /* By default form elements do not inherit font features */
    font-size: inherit;
    font-family: inherit;
  }

  input[type='checkbox'] {
    height: 2em;
    padding: 0;
    margin: 0;
  }

  /*
    One could hack the file input element to have nice styling
    using some clever hacks:
    
    https://stackoverflow.com/questions/572768/styling-an-input-type-file-button?rq=1

    However this also destroys accessibility and features such as
    showing the filename and drag and drop into the fileinput.

    It does not seem worth it, so I live with mostly default styling, except
    for the button which can be styled on some browsers with a pseudo element.
  */

  button,
  input[type='file']::-webkit-file-upload-button,
  input[type='file']::file-selector-button {
    font-weight: bold;
    padding: 6px 12px 6px 12px;
    border: none;
    background-color: #e0e1e2;
    color: rgba(0, 0, 0, 0.8);
    border-radius: 3px;
  }

  button:hover,
  input[type='file']::-webkit-file-upload-button:hover,
  input[type='file']::file-selector-button:hover {
    filter: brightness(85%);
  }

  button:active,
  input[type='file']::-webkit-file-upload-button:active,
  input[type='file']::file-selector-button:active {
    filter: brightness(65%);
  }

  button:disabled,
  button.primary:disabled,
  input[type='file']:disabled {
    background-color: #e0e1e2;
    color: rgba(0, 0, 0, 0.4);
  }

  button.primary {
    background-color: #2185d0;
    color: rgba(255, 255, 255, 0.9);
  }
</style>`
