/**
 * Code.gs — Entry point (khung ban đầu).
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('SPX Exception Handling')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
