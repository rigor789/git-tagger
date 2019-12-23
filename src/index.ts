import {Command, flags} from '@oclif/command'
import {ux} from 'cli-ux'
import * as chalk from 'chalk'
// @ts-ignore
import * as finderTag from 'finder-tag'
import * as simpleGit from 'simple-git/promise'
import * as walkSync from 'walk-sync'
import {Entry} from 'walk-sync'
import {resolve as resolvePath, join as joinPath} from 'path'

enum Tag {
  CLEAR = 'clear',
  MODIFIED = 'yellow',
  PUSHED = 'green',
  UNPUSHED = 'red',
}

class GitTagger extends Command {
  static description = 'Tag folders in current directory based on git status'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),

    clear: flags.boolean({
      char: 'c',
      description: 'Clear tags from folders'
    }),
    ignore: flags.string({
      char: 'i',
      default: '**/node_modules/*, **/vendor/*',
      description: 'Comma separated list of ignore globs.'
    }),
    maxDepth: flags.integer({
      char: 'd',
      default: 1
    })
  }

  static args = [{
    name: 'basePath',
    required: false,
    default: process.cwd()
  }]

  async run() {
    if (this.config.platform !== 'darwin') {
      this.error('Platform not supported. This command only works on OSX systems.')
      this.exit(1)
    }

    const {args, flags} = this.parse(GitTagger)

    const bar = ux.progress({
      format: `[${chalk.green('{bar}')}] | {value}/{total} | ${chalk.yellow('{currentPath}')}`
    })

    const globs = Array(flags.maxDepth).fill(0).map((_, index) => {
      return '*/'.repeat(index + 1) + '.git/'
    })
    const ignores = flags.ignore.split(',').map(glob => glob.trim())
    const entries = this.getEntries(resolvePath(args.basePath), globs, ignores).filter(entry => entry.isDirectory())

    bar.start(entries.length, 0)
    for (let i = 0; i < entries.length; i++) {
      bar.update(i + 1, {
        currentPath: entries[i].fullPath
      })
      await this.addTagsToEntry(entries[i], {
        clear: flags.clear
      })
    }

    bar.update(entries.length, {currentPath: 'DONE!'})
    bar.stop()
  }

  tagPath(path: string, tag: Tag) {
    return finderTag(path, tag)
  }

  getEntries(basePath: string, globs: Array<string>, ignore: Array<string>): Entry[] {
    return walkSync.entries(basePath, {
      globs,
      directories: true,
      ignore,
    })
  }

  async addTagsToEntry(entry: walkSync.Entry, options: { clear: boolean } = {clear: false}) {
    const path = joinPath(
      entry.basePath,
      entry.relativePath.replace(/\.git\//, '')
    )
    const git = simpleGit(path)
    const isRepo = await git.checkIsRepo()

    if (!isRepo) {
      return false
    }

    // clear tags before adding any
    this.tagPath(path, Tag.CLEAR)

    if (options.clear) {
      return true
    }

    const status = await git.status()

    if (status.files.length) {
      await this.tagPath(path, Tag.MODIFIED)
    } else if (status.ahead > 0) {
      await this.tagPath(path, Tag.UNPUSHED)
    } else {
      await this.tagPath(path, Tag.PUSHED)
    }

    return true
  }
}

export = GitTagger
