import * as maquette from 'maquette';

const h = maquette.h;
const projector = maquette.createProjector();

/*
const store = {
	_id: 'ROOT',
	_rev: 'ROOTREV',
	name: 'ROOT',
	content: 'ROOTCONTENT'
	children: [
		{
			_id: 'ROOT',
			_rev: '1',
			name: 'ROOT',
			content: 'ROOTCONTENT',
			children: []
		},
		{
			_id: 'foo',
			_rev: '1',
			name: 'Foo',
			content: 'ROOTCONTENT',
			children: []
		},
		{
			_id: 'ROOT',
			_rev: '1',
			name: 'ROOT',
			content: 'ROOTCONTENT',
			children: []
		},
	]
}
*/


function render() {
  return h('h2', ['This is the sub heading, really.']);
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(document.querySelector('#treething'), render);
});
