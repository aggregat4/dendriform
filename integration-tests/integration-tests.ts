import { testPeerIdMapper } from './peeridmapper.test'

// TODO: instead just import the test file and have tizzytest fínd all the tests
testPeerIdMapper()

// TODO: fix this status communication
const div = document.createElement('div')
div.setAttribute('id', 'integration-test-status')
document.body.appendChild(div)
