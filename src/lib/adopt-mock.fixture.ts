/** A module for the `adoptMock` spec to mock — the real one answers something no stub would. */
export interface User {
  id: number;
  name: string;
}

export function loadUser(id: number): Promise<User> {
  return Promise.resolve({ id, name: 'real' });
}
