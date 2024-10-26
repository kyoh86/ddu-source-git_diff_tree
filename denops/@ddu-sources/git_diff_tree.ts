import type { GatherArguments } from "jsr:@shougo/ddu-vim@~6.2.0/source";
import type { Denops } from "jsr:@denops/std@~7.3.0";
import * as fn from "jsr:@denops/std@~7.3.0/function";
import { treePath2Filename } from "jsr:@shougo/ddu-vim@~6.2.0/utils";
import type { ActionData as FileActionData } from "jsr:@shougo/ddu-kind-file@~0.9.0";

import type { Item } from "jsr:@shougo/ddu-vim@~6.2.0/types";
import { BaseSource } from "jsr:@shougo/ddu-vim@~6.2.0/source";
import { TextLineStream } from "jsr:@std/streams@~1.0.0";
import { join } from "jsr:@std/path@~1.0.2";
import { ChunkedStream } from "jsr:@hibiki/chunked-stream@~0.1.4";
import { echoerrCommand } from "jsr:@kyoh86/denops-util@~0.1.0/command";

type ActionData = FileActionData;

type Params = {
  commitHash: string;
};

async function getCWD(denops: Denops, option?: string) {
  if (option && option !== "") {
    return option;
  }
  return await fn.getcwd(denops);
}

export class Source extends BaseSource<Params, ActionData> {
  override kind = "file";

  override gather(
    { denops, sourceOptions, sourceParams }: GatherArguments<Params>,
  ) {
    return new ReadableStream<Item<ActionData>[]>({
      async start(controller) {
        const cwd = await getCWD(denops, treePath2Filename(sourceOptions.path));
        const { pipeOut, finalize, wait } = echoerrCommand(denops, "git", {
          args: [
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            sourceParams.commitHash,
          ],
          cwd,
        });
        await Promise.all([
          pipeOut
            .pipeThrough(new TextLineStream())
            .pipeThrough(new ChunkedStream({ chunkSize: 1000 }))
            .pipeTo(
              new WritableStream<string[]>({
                write: (files: string[]) => {
                  controller.enqueue(files.map((file) => {
                    return {
                      word: file,
                      action: { path: join(cwd, file), text: file },
                    };
                  }));
                },
              }),
            ),
          wait,
        ]).finally(async () => {
          controller.close();
          await finalize();
        });
      },
    });
  }

  override params(): Params {
    return { commitHash: "HEAD" };
  }
}
