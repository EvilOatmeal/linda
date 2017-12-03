export default function log(...args) {
  const prefix = '"%c Linda", "color: green; font-weight: bold;"'
  const consoleStatement = `console.log(${prefix}, ...${JSON.stringify(args)});`

  if (!chrome.devtools) {
    return console.log(...args)
  }
  chrome.devtools.inspectedWindow.eval(consoleStatement)
}
