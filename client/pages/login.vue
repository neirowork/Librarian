<template lang="pug">
  section.pageContainer
    .panel
      h2.panel_header Librarianにログイン
      .panel_container
        .alert.alert-danger(v-if='error')
          .alert_content {{ error.message }}

        form(@submit.prevent='login()').form
          span.form_part
            label.form_part_label ログインID
            input.form_part_input(type='text', pattern='^[0-9a-zA-Z]+$', v-model='loginId')
          span.form_part
            label.form_part_label パスワード
            input.form_part_input(type='password' v-model='password')
          span.form_part
            button(type='submit').button.button-block.button-primary ログイン
</template>

<script>
import { mapActions, mapGetters } from 'vuex'

export default {
  beforeMount() {
    if (this.isLoggedin) {
      this.$router.replace('/')
    }
  },
  computed: {
    ...mapGetters({
      userData: 'session/data',
      isLoggedin: 'session/isLoggedIn'
    })
  },
  data() {
    return {
      user: null,
      loginId: '',
      password: '',
      error: null
    }
  },
  methods: {
    ...mapActions({
      requireAuth: 'session/requireAuth',
      authorize: 'session/authorize'
    }),
    login() {
      this.error = null

      this.authorize({
        loginId: this.loginId,
        password: this.password
      })
        .then(res => {
          this.$router.replace('/')
        })
        .catch(err => {
          this.error = {
            message:
              err.response.status === 422
                ? '入力内容に不備があります'
                : err.response.status === 403
                  ? '認証に失敗しました'
                  : err.response.status
          }
        })
    }
  }
}
</script>

<style lang="scss" scoped>
.pageContainer {
  text-align: center;
}
.panel {
  display: inline-block;
  width: 480px;

  @media screen and (max-width: 600px) {
    width: 100%;
  }
}
</style>
