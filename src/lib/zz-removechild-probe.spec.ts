import { createSpyFromInstance } from './create-spy-from-instance';
import { setSpyStrict } from './strict';

it('probe', () => {
  const el = document.createElement('div');
  document.body.append(el);
  createSpyFromInstance(el, ['addEventListener']).addEventListener.mockImplementation(() => undefined);
  expect(() => document.body.removeChild(el)).not.toThrow();
});
