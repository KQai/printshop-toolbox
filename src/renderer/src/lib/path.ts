export const dirname = (p: string): string => p.replace(/[\\/][^\\/]*$/, '')

export const basename = (p: string): string => p.split(/[\\/]/).pop() ?? ''

export const withoutExt = (p: string): string => basename(p).replace(/\.[^./\\]+$/, '')

export const joinPath = (dir: string, name: string): string =>
  /[\\/]$/.test(dir) ? dir + name : `${dir}\\${name}`
