<template>
<div id='mercurius-home'>
  <div id='header'>
    <div id='path'>
      <button class='button is-white folder' style='margin-right: 0.5rem;' :disabled='splitDir.length <= 1' @click='goto(splitDir.length - 2)'><b-icon icon='folder-upload'></b-icon></button>
      <template v-for='(d, i) in splitDir'>
        <a :key='"a-"+i' class='tag' @click='goto(i)' :title='d'>{{annotations[d] || d}}</a>
        <span :key='"s-"+i' v-if='i + 1 < splitDir.length'><b-icon icon='chevron-right'></b-icon></span>
      </template>
    </div>
    <div id='buttons'>
      <b-checkbox v-model='skipAKs'>Skip Animal Kingdom's</b-checkbox>
      <button class='button is-white' @click='refresh()' :disabled='working' title='Refresh'><b-icon icon='refresh'></b-icon></button>
      <button class='button is-white' :disabled='!anyActive || working' @click='download()' title='Download'><b-icon icon='download'></b-icon></button>
      <button class='button is-white' :disabled='working' @click='lookupApp()' title='Lookup App'><b-icon icon='cloud-search'></b-icon></button>
      <a class='button is-white' :href='"data:application/json," + JSON.stringify(index)' target='_blank' rel='noopener noreferrer' title='Migration Index'><b-icon icon='script-text'></b-icon></a>
    </div>
  </div>
  <div id='explorer' ref='explorer'>
    <div id='background' @mousedown='drawStart($event)'><h5 class='subtitle is-5' v-if='folders.length === 0 && files.length === 0'>Nothing here...</h5></div>
    <a v-for='folder of folders' :key='"/" + folder'
    :class='{ active: active["/" + folder], "last-active": lastActive === "/" + folder }'
    class='folder' :id='"m-/" + folder' @click='onClick($event, "/" + folder)'>
      <b-icon icon='folder'></b-icon>
      <span>{{folder}}</span>
      <b-tag style='margin-left: 0.5rem;' v-if='annotations[folder]'>{{annotations[folder]}}</b-tag>
    </a>
    <a
      v-for='file of files'
      :key='file'
      :class='{ active: active[file], "last-active": lastActive === file }'
      :id='"m-"+file'
      class='file'
      :href='fileUrl(file)'
      @click.prevent='onClick($event, file)'
    >
      <b-icon icon='file' style='color:#BDBDBD'></b-icon>
      <span>{{file}}</span>
    </a>
    <div v-show='drawing' id='selectbox' :style='drawPos'></div>
    <!-- div v-show='drawing' style='position: fixed; border: 2px solid red;' :style='{ top: drawPoints.y1 + "px", left: drawPoints.x1 + "px" }'></div>
    <div v-show='drawing' style='position: fixed; border: 2px solid green;' :style='{ top: drawPoints.y1 + "px", left: drawPoints.x2 + "px" }'></div>
    <div v-show='drawing' style='position: fixed; border: 2px solid blue;' :style='{ top: drawPoints.y2 + "px", left: drawPoints.x1 + "px" }'></div>
    <div v-show='drawing' style='position: fixed; border: 2px solid yellow;' :style='{ top: drawPoints.y2 + "px", left: drawPoints.x2 + "px" }'></div -->
  </div>
  <div id='loader' v-if='working || workingOn'>
    <a @click='cancel = true' style='z-index: 1; color: black'>
      <b-icon icon='close' size='is-small' />
      <span>Cancel{{ cancel ? 'ling...' : '' }}</span>
    </a>
    <span style='flex-grow: 1'></span>
    <span>{{workingOn}}...</span>
    <div id='mercurius-loading-small'></div>
    <div id='progress' class='has-background-primary' :style='{ width: (progress * 100).toFixed(2) + "%" }'></div>
  </div>
</div>
</template>
<script src='./home.ts'></script>
<style lang='scss'>
#mercurius-home {

  display: flex;
  flex-flow: column;

  .folder > span.icon {
    color: #FFD54F;
  }

  div#selectbox {
    position: fixed;
    background-color: rgba(3, 168, 244, 0.33);
    border: 1px solid rgba(3, 168, 244, 0.67);
  }

  div#explorer {
    padding: 1.25rem;
    position: relative;
    flex-grow: 1;

    > div#background {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      user-select: none;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    > a {
      color: inherit;
      user-select: none;
      cursor: default;
      position: relative;
      display: flex;
      align-items: center;
      border: 1px solid transparent;
      * {
        pointer-events: none;
      }
      &:hover, &.hover {
        background-color: rgb(225,245,254);
        border-color: rgb(79,195,247);
      }
      &.active {
        background-color: rgb(179,229,252);
        border-color: rgb(129,212,250);
        &:hover, &.last-active {
          border-color: rgb(79,195,247);
        }
      }
      &.last-active {
        border-color: rgb(79,195,247);
      }
    }
  }

  div#header {
    padding: 0.5rem;
    display: flex;
    justify-content: space-between;
    border-bottom: 2px solid rgba(0,0,0,0.05);
    > div#path {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
    }
    > div#buttons {
      display: flex;
      align-items: center;
      > * { margin: 0; }
    }
  }

  > div#loader {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: right;
    padding-bottom: 3px;
    font-size: 0.8rem;
    > * {
      position: relative;
    }
    > div#progress {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      top: 0;
      opacity: 0.33;
      border-top: 1px solid rgba(0, 0, 0, 0.2);
      border-right: 1px solid rgba(0, 0, 0, 0.2);
    }
  }

  div#mercurius-loading-small {
    position: relative;
    background-color: #2c113a;
    width: 3px;
    height: 3px;
    margin: 9px;
    border-radius: 50%;

    &:after, &:before {
      content: "";
      position: absolute;
      width: 2px;
      height: 2px;
      border-radius: 50%;
    }

    &:after {
      left: -2px;
      top: -1px;
      background-color: #2c96ff;
      transform-origin: 3px 2px;
      animation: axis 1s linear infinite;
    }
    &:before {
      left: -5px;
      top: -3px;
      background-color: #ea2c6d;
      transform-origin: 6px 4px;
      animation: axis 2s linear infinite;
    }
  }

  @keyframes axis {
    0% {
      transform: rotateZ(0deg) translate3d(0,0,0);
    }
    100% {
      transform: rotateZ(360deg) translate3d(0,0,0);
    }
  }
}
</style>
