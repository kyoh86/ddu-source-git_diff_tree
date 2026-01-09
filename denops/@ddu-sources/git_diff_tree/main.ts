import type { GatherArguments } from "@shougo/ddu-vim/source";
import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";
import { treePath2Filename } from "@shougo/ddu-vim/utils";
import type { ActionData as FileActionData } from "@shougo/ddu-kind-file";

import type { Item } from "@shougo/ddu-vim/types";
import { BaseSource } from "@shougo/ddu-vim/source";
import { TextLineStream } from "@std/streams";
import { join } from "@std/path";
import { ChunkedStream } from "@hibiki/chunked-stream";
import { echoerrCommand } from "@kyoh86/denops-util/command";

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
