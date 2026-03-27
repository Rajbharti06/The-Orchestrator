<template>
  <div>
    <form @submit.prevent="login">
      <label>Username:</label>
      <input type="text" v-model="username" />
      <br />
      <label>Password:</label>
      <input type="password" v-model="password" />
      <br />
      <button type="submit">Login</button>
    </form>
  </div>
</template>

<script>
export default {
  data() {
    return {
      username: '',
      password: '',
    }
  },
  methods: {
    login() {
      fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: this.username, password: this.password }),
      })
        .then((response) => response.json())
        .then((data) => console.log(data))
        .catch((error) => console.error(error))
    },
  },
}
</script>