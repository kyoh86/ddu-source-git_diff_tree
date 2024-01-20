import type { GatherArguments } from "https://deno.land/x/ddu_vim@v3.9.0/base/source.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v3.9.0/deps.ts";
import { treePath2Filename } from "https://deno.land/x/ddu_vim@v3.9.0/utils.ts";
import type { ActionData as FileActionData } from "https://deno.land/x/ddu_kind_file@v0.7.1/file.ts";

import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v3.9.0/types.ts";
import { TextLineStream } from "https://deno.land/std@0.212.0/streams/text_line_stream.ts";
import { join } from "https://deno.land/std@0.212.0/path/mod.ts";
import { ChunkedStream } from "https://deno.land/x/chunked_stream@0.1.2/mod.ts";
import { echoerrCommand } from "https://denopkg.com/kyoh86/denops-util@v0.0.6/command.ts";

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
        const { pipeOut, finalize, waitErr } = echoerrCommand(denops, "git", {
          args: [
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            sourceParams.commitHash,
          ],
          cwd,
        });
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
          ).finally(async () => {
            controller.close();
            await waitErr;
            await finalize();
          });
      },
    });
  }

  override params(): Params {
    return { commitHash: "HEAD" };
  }
}
