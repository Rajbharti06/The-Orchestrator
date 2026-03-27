<template>
  <div>
    <h1>User Profile</h1>
    <p>ID: {{ userId }}</p>
    <p>Name: {{ user.name }}</p>
    <p>Email: {{ user.email }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      userId: this.$route.params.userId,
      user: {}
    }
  },
  mounted() {
    this.fetchUserData()
  },
  methods: {
    fetchUserData() {
      fetch(`/users/${this.userId}`)
        .then(response => response.json())
        .then(data => {
          this.user = data
        })
        .catch(error => console.error(error))
    }
  }
}
</script>