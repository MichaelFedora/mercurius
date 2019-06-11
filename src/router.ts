import Vue from 'vue';
import VueRouter from 'vue-router';

import HomeComponent from './components/home/home';

Vue.use(VueRouter);

const router = new VueRouter({
  mode: 'hash',
  routes: [
    { path: '**', component: HomeComponent },
  ]
});

router.beforeEach((to, from, next) => {
  if(to.path !== from.path) {
    if(to.path.length > 1) {

      const sdir = [];
      let buff = '';
      to.path.slice(1).split('/').forEach(v => {
        if(!v) buff += '/';
        else if(buff) sdir.push(buff + v);
        else sdir.push(v);
      });
      document.title = 'Mercurius - ' + sdir.join(' - ');
    } else document.title = 'Mercurius';
  }
  next();
});

export default router;
