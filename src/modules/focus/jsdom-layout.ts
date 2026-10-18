// Test-only. jsdom has no layout, and CodeMirror needs a rectangle to place
// the caret Focus draws (it throws without one), so every range reports a
// thin box. Import for the side effect.
const box = { left: 10, right: 10, top: 0, bottom: 16, width: 0, height: 16, x: 10, y: 0 };
Range.prototype.getClientRects = () => [box] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => box as DOMRect;
