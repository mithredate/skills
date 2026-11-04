const { can, permissionsOf } = require('./acl');

function grantRole(actor, target, roleName) {
  if (!can(actor, 'role.grant')) throw new Error('forbidden');
  const missing = [...permissionsOf(roleName)].filter((permission) => !can(actor, permission));
  if (missing.length > 0) throw new Error(`cannot grant ${roleName}: missing ${missing.join(', ')}`);
  return { ...target, roles: [...target.roles, roleName] };
}

module.exports = { grantRole };
