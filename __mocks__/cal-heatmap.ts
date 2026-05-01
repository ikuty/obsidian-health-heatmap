export default class CalHeatmap {
  paint = jest.fn().mockResolvedValue(undefined);
  destroy = jest.fn();
  render = jest.fn().mockReturnValue(document.createElement('div'));
}
