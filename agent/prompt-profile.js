const profile = require('./profile.json');

// projects marked public: false stay out of the agent's knowledge until they're ready to show
const visible = profile.projects.filter((p) => p.public !== false);
const visibleIds = new Set(visible.map((p) => p.id));
// the model only gets public links, never an email address it could hand out
const promptProfile = {
  ...profile,
  projects: visible,
  principles: (profile.principles || []).filter((pr) => visibleIds.has(pr.project)),
  sideProjects: (profile.sideProjects || []).filter((id) => visibleIds.has(id)),
  contact: { github: profile.contact.github, linkedin: profile.contact.linkedin },
};

module.exports = { promptProfile };
