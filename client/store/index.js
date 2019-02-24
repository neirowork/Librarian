import Vuex from 'vuex'
import createPersistedState from 'vuex-persistedstate'
import users from './users'

export default () => {
  return new Vuex.Store({
    modules: {
      users
    },
    // strict: true,
    plugins: [
      createPersistedState({
        key: 'work.neiro.librarian',
        paths: ['users.user'],
        storage: window.sessionStorage
      })
    ]
  })
}