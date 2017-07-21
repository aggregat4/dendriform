/*
const store = {
	_id: 'ROOT',
	_rev: 'ROOTREV',
	name: 'ROOT',
	content: 'ROOTCONTENT'
	children: [
		{
			_id: 'FOO',
			_rev: '1',
			name: 'Foo',
			content: 'foo content',
			children: []
		},
		{
			_id: 'BAR',
			_rev: '1',
			name: 'Bar',
			content: 'bar content',
			children: []
		},
		{
			_id: 'BAZ',
			_rev: '1',
			name: 'baz',
			content: 'baz content',
			children: []
		},
	]
}
*/

const STUB_TREE = {
	_id: 'ROOT',
	_rev: 'ROOTREV',
	name: 'ROOT',
	content: 'ROOTCONTENT',
	children: [
		{
			_id: 'FOO',
			_rev: '1',
			name: 'Foo',
			content: 'foo content',
			children: []
		},
		{
			_id: 'BAR',
			_rev: '1',
			name: 'Bar',
			content: 'bar content',
			children: []
		},
		{
			_id: 'BAZ',
			_rev: '1',
			name: 'baz',
			content: 'baz content',
			children: []
		},
	]	
}

export function loadTree(id) {
	return new Promise((resolve, reject) => { resolve(STUB_TREE) })
}