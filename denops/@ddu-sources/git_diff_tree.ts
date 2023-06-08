import type { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import type { GatherArguments } from "https://deno.land/x/ddu_vim@v3.0.0/base/source.ts";
import type { ActionData as FileActionData } from "https://deno.land/x/ddu_kind_file@v0.5.0/file.ts";

import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v3.0.0/types.ts";
import { TextLineStream } from "https://deno.land/std@0.190.0/streams/text_line_stream.ts";
import { ChunkedStream } from "https://deno.land/x/chunked_stream@0.1.2/mod.ts";

type ActionData = FileActionData;

type Params = {
  commitHash: string;
};

async function err(denops: Denops, msg: string) {
  await denops.call("ddu#util#print_error", msg, "ddu-source-git_diff_tree");
}

export class ErrorStream extends WritableStream<string> {
  constructor(denops: Denops) {
    super({
      write: async (chunk, _controller) => {
        await err(denops, chunk);
      },
    });
  }
}

export class Source extends BaseSource<Params, ActionData> {
  override kind = "file";

  override gather({ denops, sourceParams }: GatherArguments<Params>) {
    const { status, stderr, stdout } = new Deno.Command("git", {
      args: [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        sourceParams.commitHash,
      ],
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    }).spawn();
    status.then((stat) => {
      if (!stat.success) {
        stderr
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream())
          .pipeTo(new ErrorStream(denops));
      }
    });
    return stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeThrough(
        new TransformStream<string, Item<ActionData>>({
          transform: (file, controller) => {
            controller.enqueue({ word: file, action: { path: file } });
          },
        }),
      )
      .pipeThrough(new ChunkedStream({ chunkSize: 1000 }));
  }

  override params(): Params {
    return { commitHash: "HEAD" };
  }
}
