<template>
<div id='mercurius-login'>
<div class='container' id='login'>
  <form>
    <b-field
      label='Mnemonic (Keychain Phrase)'
      :message='!valid ? "Mnemonic: Must be 12 or 24 lowercase words" : ""'
    >
      <b-input
        required
        regex='/^\s*(?:(?:[a-z]+\s){11}|(?:[a-z]+\s){23})[a-z]+\s*$/'
        name='mnemonic'
        placeholder='apple banana orange cherry mango kiwi grape watermelon strawberry lemon keyboard cat'
        type='textarea'
        v-model.trim='mnemonic'
      />
    </b-field>
  </form>
  <span class='error has-text-danger' v-show='error'>{{ error }}</span>
  <button class='button is-primary slim' :disabled='!this.mnemonic || !valid' @click='login()'>Login</button>
</div>
</div>
</template>
<script src='./mercurius-login.ts'></script>
<style lang='scss'>
div#mercurius-login {
  div.container {
    button {
      width: 100%;
    }
    padding: 2rem;

    display: flex;
    flex-flow: column;
    flex-wrap: nowrap;
    align-items: center;
    width: 100%;
    background-color: white;
    > * {
      margin: 0;
    }
    > span.marg {
      margin-bottom: 1rem;
    }
    > :not(span):not(:last-child) {
      margin-bottom: 1rem;
    }
  }

  form {
    width: 100%;
    display: flex;
    flex-flow: column;
    > * {
      width: 100%;
    }
  }

  .slim {
    padding: .25rem .5rem;
  }
}
</style>
