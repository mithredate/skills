const test = require('node:test');
const assert = require('node:assert');
const { grantRole } = require('../server/roles');

test('a team lead grants the agent role', () => {
  const teamLead = { roles: ['team-lead'] };
  const expected = { id: 7, roles: ['agent'] };

  const sut = grantRole(teamLead, { id: 7, roles: [] }, 'agent');

  assert.deepStrictEqual(sut, expected);
});

test('an agent cannot grant a role', () => {
  const agent = { roles: ['agent'] };

  assert.throws(() => grantRole(agent, { id: 7, roles: [] }, 'agent'), /forbidden/);
});
